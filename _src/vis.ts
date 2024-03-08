// import * as vl from "https://deno.land/x/vega_lite@v4.17.0/src/index.ts";

import {TopLevelSpec} from "npm:vega-lite"
import { lazy } from "jsr:@nfnitloop/better-iterators"
// import Ajv from "npm:ajv@8.12.0"

import {DB, StatsRow, SpanData} from "./db.ts"
import { speed } from "./test_speed/display.ts"

export function getStats(dbPath: string) {
    using db = DB.open(dbPath)
    const last = db.getLastStats(10_000);
    return lazy(last)
        .map(row => {
            const base = { ts: row.ts, g: row.g }
            return [
                { ...base, stat: "sinr", value: row.sinr },
                { ...base, stat: "rsrp", value: row.rsrp },
                { ...base, stat: "rsrq", value: row.rsrq },
                { ...base, stat: "rssi", value: row.rssi },
                { ...base, stat: "bars", value: row.bars },
            ]
        })
        .flatten()
        .toArray()
}



export function graph(rows: StatsRow[]): Deno.jupyter.Displayable {
    const spec: TopLevelSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
            values: rows,
            format: {
                parse: {
                    "ts": "date"
                }
            }
        },
        // mark: "line",
        mark: {
            type: "bar",
            point: true,
        },
        encoding: {
            x: {field: "ts", type: "temporal", bin: {maxbins: 50, nice: true}},
            y: {field: "sinr", aggregate: "average", title: "Signal/Noise Ratio"},
            color: {field: "g", type: "nominal"},
            // color: {
            //     field: 
            // }
        },
        width: 1000,
        height: 600,
        // height: "container"

    }

    return toVega(spec)
}


// See: https://vega.github.io/vega-lite/usage/embed.html


export function toVega(json: object): Deno.jupyter.Displayable {

    const vo: Deno.jupyter.VegaObject = {
        $schema: "https://vega.github.io/schema/vega-lite/v5.json",
        ...json
    }

    // validateVegaLite(vo)
    
    return {
        [Deno.jupyter.$display]: () => ({
            "application/vnd.vegalite.v5+json": vo
        })
    }
}

/** 
 * Validate that a thing is valid vegalite schema.
 * 
 * Why VegaLite doesn't do this itself is beyond me. But you'll end up with weird
 * unfriendly javascript errors if you pass in a definition w/ the wrong shape.
 * 
 * Validate before you pass to vega to save your sanity.
 * 
 * @throws on invalid data.
 */
// export function validateVegaLite(data: object) {
//     if (validate(data)) { return }

//     throw new Error(validate.errors![0].message)
// }

// const validate = await (async () => {
//     const mod = await import("./vis/vega-lite.v5.schema.json", {with: {type: "json"}})
//     const schema = mod.default
//     // LOL: https://github.com/ajv-validator/ajv/issues/2132#issuecomment-1290409907
//     const ajv = new Ajv.default()
//     return ajv.compile(schema)
// })()

/**
 * Meh, Plotly doesn't dynamically re-bin on zoom. I prefer that.
 */
export function toPlotly(json: object): Deno.jupyter.Displayable {
    return {
        [Deno.jupyter.$display]: () => ({
            "application/vnd.plotly.v1+json": json
        })
    }
}

function dateFmt(ts: number) {
    return new Date(ts).toLocaleDateString()
}

function timeFmt(ts: number) {
    return new Date(ts).toLocaleTimeString()
}


const display = Deno.jupyter.display
const html = Deno.jupyter.html

async function displayTable<K extends string>(headers: Record<K,string>, data: Record<K,unknown>[]) {
    const keys = Object.keys(headers) as K[]

    const table = [`<table>`, `<tr>`]
    for (const key of keys) {
        table.push(`<th>`, headers[key], `</th>`)
    }
    table.push(`</tr>`)

    for (const row of data) {
        table.push(`<tr>`)
        for (const key of keys) {
            table.push(`<td>${row[key]}</th>`)
        }
        table.push(`</tr>`)
    }

    table.push(`</table>`)

    await display(html`${table.join("")}`)
}

export async function displaySpan(data: SpanData) {
    // const title = `${data.note}\n${dateFmt(data.start)} - ${dateFmt(data.effectiveEnd)}`
    const title = `${data.note}`
    const range = `${dateFmt(data.start)}<br/>${timeFmt(data.start)} - ${timeFmt(data.effectiveEnd)}`
    await display(html`
        <hr>
        <h1>${title}</h1>
        <h3>${range}</h3>
    `)

    const rows = []
    
    const byBand = lazy(data.stats).groupBy(it => it.band)
    for (const [band, values] of byBand.entries()) {
        const sinrs = values.map(v => v.sinr)
        const avg = lazy(sinrs).avg().toPrecision(3)
        const count = sinrs.length
        const min = Math.min(...sinrs)
        const max = Math.max(...sinrs)
        rows.push({
            band,
            avg,
            min,
            max,
            count
        })
    }

    // bandwidth averages:
    await displayTable(
        {
            band: "Band",
            avg: "Avg",
            max: "Max",
            min: "Min",
            count: "Count",
        }, 
        rows
    )

    // Notes
    for (const note of data.notes) {
        const time = timeFmt(note.timestampMsUtc)
        await display(html`<li>${time} - ${note.note}`)
    }

    if (data.speedTests.length > 0) {
        await displayTable(
            {
                start: "Started",
                download: "Down",
                upload: "Up",
            },
            data.speedTests.map(s => ({
                download: speed(s.download),
                upload: speed(s.upload),
                start: timeFmt(s.start),
            }))
        )    
    }

    const graph = toVega({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: {
            values: data.stats
        },
        width: 900,
        height: 300,
        mark: {
            type: "line",
            point: true,
            tooltip: true,         
        },
        encoding: {
            x: {
                field: "ts",
                type: "temporal",
                bin: {
                    maxbins: 100,
                    //   extent: {param: "zoom"},
                },
            },
            y: {field: "sinr", aggregate: "average",},
            color: {field: "band", type: "nominal"},
        },
        // params: [{
        //     name: "zoom",
        //     select: "interval",
        //     bind: "scales",
        // }]
    })
    await Deno.jupyter.display(graph)
}


function main() {
    const stats = getStats("../.tmi-stats.sqlite3")
    console.log(stats.length)
}

if (import.meta.main) {
    main()
}