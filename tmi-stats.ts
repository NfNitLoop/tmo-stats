#!/usr/bin/env -S deno run --allow-net 

import * as tmo from "./_src/tmobile-gateway/tmobile-gateway.ts"
import { Command } from "./deps/cliffy/command.ts"

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


if (import.meta.main) {
    main()
}