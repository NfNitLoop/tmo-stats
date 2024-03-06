// import * as vl from "https://deno.land/x/vega_lite@v4.17.0/src/index.ts";

import {TopLevelSpec} from "npm:vega-lite"

import type {StatsRow} from "./db.ts"

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
    return {
        [Deno.jupyter.$display]: () => ({
            "application/vnd.vegalite.v5+json": {
                $schema: "https://vega.github.io/schema/vega-lite/v5.json",
                ...json
            }
        })
    }
}



Deno.jupyter.$display