#!/usr/bin/env -S deno run --allow-net 

import * as tmo from "./_src/tmobile-gateway/tmobile-gateway.ts"
import { DB } from "./_src/db.ts"
import * as speedtest from "./_src/test_speed/ookla.ts"
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
        .globalOption("--db <file:string>", "Where should we save statistics?", {
            default: ".tmi-stats.sqlite3"
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
        .description("Watch the router stats and record them to a database.")
        .action(watch)

    // const db_cmd = cmd.command("db")
    //     .action(() => db_cmd.showHelp())

    // db_cmd.command("db check")
    //     .action(db_check)

    const db = new Command<GlobalOptions>()
        .name("db")
        .description("Subcommands for working with the database")
        .action(() => db.showHelp())

    db.command("check", new Command<GlobalOptions>()
        .description("Check the validity of the database.")
        .action(db_check)
    )

    cmd.command(db.getName(), db)

    const speedtest = new Command<GlobalOptions>()
        .name("speedtest")
        .description("Run a bandwidth speed test, show & record results")
        .action(cmdSpeedtest)
    cmd.command(speedtest.getName(), speedtest)

    await cmd.parse(args)
}

type GlobalOptions = {
    host: string
    db: string
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
    using db = DB.openOrCreate(opts.db)
    while (true) {
        try {
            console.log(colors.yellow(new Date().toLocaleTimeString()))
            const data = await client.getData()
            db.saveSignal(data.signal)
            show(data)
        } catch (e: unknown) {
            if (is_error(e)) {
                console.warn(e.toString())
            } else {
                console.warn(e)
            }
        }

        await delay(5000)
    }
}

function is_error(e: unknown): e is Error {
    return (
        typeof e == "object"
        && e != null
        && typeof e.toString == "function"
    )
}

function show(data: tmo.Stats) {
    const table = new Table()
    for (const row of rows(data)) {
        table.push([
            row.whatG,
            row.band,
            `bars: ${row.bars}`,
            color("sinr", row.sinr),
            color("rsrq", row.rsrq),
            color("rsrp", row.rsrp),
            color("rssi", row.rssi),
        ])
    }
    table.render()
}

const bg = {
    green: colors.black.bgGreen,
    lightGreen: colors.black.bgBrightGreen,
    yellow: colors.black.bgYellow,
    orange: (text: string) => colors.black.bgRgb24(text, 0xfc9803),
    red: colors.black.bgRed
}

// Colors according to: https://www.rangeful.com/what-is-rssi-sinr-rsrp-rsrq-how-does-this-affect-signal-quality/
function color(name: "sinr"|"rsrp"|"rsrq"|"rssi", value: number): string {
    const text = `${name}: ${value}`
    if (name == "sinr") {
        if (value >= 20) {
            return bg.green(text)
        }
        if (value >= 13) {
            return bg.yellow(text)
        }
        if (value >= 0) {
            return bg.orange(text)
        }
        return bg.red(text)
    }

    if (name == "rsrp") {
        if (value >= -80) {
            return bg.green(text)
        }
        if (value >= -90) {
            return bg.yellow(text)
        }
        if (value >= -100) {
            return bg.orange(text)
        }
        return bg.red(text)
    }

    if (name == "rsrq") {
        if (value >= -10) {
            return bg.green(text)
        }
        if (value >= -15) {
            return bg.yellow(text)
        }
        if (value >= -20) {
            return bg.orange(text)
        }
        return bg.red(text)
    }

    if (name == "rssi") {
        if (value >= -65) {
            return bg.green(text)
        }
        if (value >= -75) {
            return bg.lightGreen(text)
        }
        if (value >= -85) {
            return bg.yellow(text)
        }
        if (value >= -95) {
            return bg.orange(text)
        }
        return bg.red(text)
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

function db_check(opts: GlobalOptions) {
    using db = DB.openOrCreate(opts.db)
    db.check()
    console.log("👍 OK")
}

async function cmdSpeedtest(opts: GlobalOptions) {
    using db = DB.openOrCreate(opts.db)

    console.log("Running speed test ...")
    const started = Date.now()
    const results = await speedtest.run()
    const finished = Date.now()
    console.log(results)

    console.log(`download: ${speed(results.download.bandwidth)}`)
    console.log(`upload:   ${speed(results.upload.bandwidth)}`)
    console.log(`ping(ms): ${results.ping.latency}`)

    db.saveSpeedTest({started, finished, data: results})
}

/** Human-readable bandwidth speeds */
function speed(bytes_per_second: number): string {
    let value = bytes_per_second * 8 // to bits!

    const units = ["bps", "Kbps", "Mbps", "Gbps"]
    while (units.length > 1 && value > 1000) {
        value = value / 1000
        units.shift()
    }

    return `${value.toPrecision(3)} ${units[0]}`
}


if (import.meta.main) {
    main()
}