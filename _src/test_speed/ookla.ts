/**
 * This speed test requires using the `speedtest` CLI which you can get at:
 * <https://www.speedtest.net/apps/cli>.
 * 
 * Make sure to run it once to accept the user license after installing.
 * 
 * @module
 */

import { z } from "../../deps/zod.ts";

async function main() {
    console.log("Running...")
    const result = await run();
    console.log(result)
}

const PingLatency = z.object({
    jitter: z.number(),
    latency: z.number(),
    low: z.number(),
    high: z.number(),
})

const LoadedLatency = z.object({
    jitter: z.number(),
    iqm: z.number(),
    low: z.number(),
    high: z.number(),
})

const UpDownStats = z.object({
    bandwidth: z.number().describe("bytes per second"),
    bytes: z.number(),
    elapsed: z.number(), // ms, I thnk?
    latency: LoadedLatency
})

const TestResult = z.object({
    type: z.literal("result"),
    ping: PingLatency,
    download: UpDownStats,
    upload: UpDownStats,
    packetLoss: z.number(),
    server: z.object({
        id: z.number(),
        host: z.string(),
        port: z.number(),
        name: z.string(),
        location: z.string(),
        ip: z.string().describe("IP address. v4/v6"),
    }),
    result: z.object({
        url: z.string(),
        persisted: z.boolean().optional()
    })
})
export type TestResult = z.infer<typeof TestResult>

const NOT_FOUND_ERR_MSG = `
Couldn't find the "speedtest" command in your PATH.

Running the speed test requires the "speedtest" CLI, which
you can get here: https://www.speedtest.net/apps/cli

Make sure to run it once manually after installing to 
accept its EULA.
`.trim()

export async function run(): Promise<TestResult> {
    const cmd = new Deno.Command("speedtest", {
        args: ["--format=json-pretty"],
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
    })
    let proc;
    try {
        proc = cmd.spawn()
    } catch (e: unknown) {
        if (e instanceof Deno.errors.NotFound) {
            console.error("ERROR: ", NOT_FOUND_ERR_MSG)
        }
        throw e
    }
    const result = await proc.output()
    const out = decoder.decode(result.stdout)
    if (!result.success) {
        const err = decoder.decode(result.stderr)
        throw new Error(`Error running "speedtest": ${out} ${err}`)
    }
    let parsed;
    try {
        parsed = TestResult.parse(JSON.parse(out))
    } catch (e: unknown) {
        console.error("Error parsing output: ", out)
        throw e
    }
    return parsed
}

const decoder = new TextDecoder();

if (import.meta.main) {
    await main()
}