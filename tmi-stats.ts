#!/usr/bin/env -S deno run --allow-net 

import * as tmo from "./_src/tmobile-gateway/tmobile-gateway.ts"
import { Command } from "./deps/cliffy/command.ts"
import { delay } from "./deps/std/async.ts"
import { Table } from "./deps/cliffy/table.ts"
import { colors } from "./deps/cliffy/colors.ts"

async function main() {
    await parse_args(Deno.args)
}

async function parse_args(args: string[]) {
    const cmd = new Command()
        .name("tmi-stats")
        .description("Collects statistics from your T-Mobile Home Internet Gateway")
        .globalOption("--host <host:string>", "Where to connect to the gateway", {
            default: tmo.DEFAULT_CONFIG.host
        })
        .default("help")

    cmd.command("help")
        .description("Show help")
        .action(() => {
            cmd.showHelp()
        })

    cmd.command("get")
        .description("Just get and show the stats once")
        .action(get_once)

    cmd.command("watch")
        .action(watch)

    await cmd.parse(args)
}

type GlobalOptions = {
    host: string
}

async function get_once(opts: GlobalOptions) {
    const client = new tmo.Client(opts)

    const json = await client.getRawJSON()
    console.log(json)

    // Just double check that the JSON parses and give errors if it didn't:
    tmo.Stats.parse(json)
}

async function watch(opts: GlobalOptions) {
    const client = new tmo.Client(opts)
    while (true) {
        try {
            console.log("")
            console.log(new Date())
            const data = await client.getData()
            show(data)
        } catch (e: unknown) {
            console.error(e)
        }

        await delay(5000)
    }
}

function show(data: tmo.Stats) {
    const table = new Table()
    for (const row of rows(data)) {
        table.push([
            row.whatG,
            row.band,
            `bars: ${row.bars}`,
            color("sinr", row.sinr),
            `rsrp: ${row.rsrp}`,
            `rsrq: ${row.rsrq}`,
            `rssi: ${row.rssi}`,
        ])
    }
    table.render()
}

function color(name: "sinr"|"rsrp"|"rsrq"|"rssi", value: number): string {
    const text = `${name}: ${value}`
    if (name == "sinr") {
        if (value >= 20) {
            return colors.black.bgGreen(text)
        }
        if (value >= 13) {
            return colors.black.bgYellow(text)
        }
        if (value >= 0) {
            return colors.black.bgRgb24(text, 0xfc9803)
        }
        return colors.black.bgRed(text)
    }

    return text
}

type Row = {
    whatG: "5g" | "4g",
    band: string,
    bars: number,
    sinr: number,
    rsrp: number,
    rsrq: number,
    rssi: number,
}

function rows(data: tmo.Stats): Row[] {
    const rows: Row[] = []
    const addRow = (si: tmo.SignalInfo, whatG: "5g"|"4g") => {
        for (const band of si.bands) {
            const row: Row = {
                whatG,
                band,
                bars: si.bars,
                sinr: si.sinr,
                rsrp: si.rsrp,
                rsrq: si.rsrq,
                rssi: si.rssi,    
            }
            rows.push(row)
        }
    }

    const {"5g": g5, "4g": g4} = data.signal
    if (g4) { addRow(g4, "4g") }
    if (g5) { addRow(g5, "5g") }

    return rows
}


if (import.meta.main) {
    main()
}