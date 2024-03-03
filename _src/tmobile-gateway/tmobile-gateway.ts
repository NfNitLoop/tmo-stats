/**
 * Utilities for fetching data from the t-mobile home internet gateway.
 * 
 * @module
 */

import { equal } from "https://deno.land/std@0.218.2/assert/equal.ts"
import { delay } from "../../deps/std/async.ts";
import { z } from "../../deps/zod.ts";

/**
 * Where the gateway usually is hosted on your local network.
 */
export const DEFAULT_CONFIG = {
    // example url: "http://192.168.12.1/TMI/v1/gateway?get=all",
    host: "192.168.12.1",
    schema: "http",
    requestPath: "/TMI/v1/gateway?get=all"
} as const;


export class Client {
    readonly host: string;
    #getUrl: string;

    #lastFetch: {ts: number, data: Stats}|null = null

    constructor(args: ClientArgs) {
        this.host = args.host
        this.#getUrl = `http://${this.host}${DEFAULT_CONFIG.requestPath}`
    }

    /** Prefer {@link getData} */
    async getRawJSON() {
        const response = await fetch(this.#getUrl)
        const json = await response.json()
        return json
    }

    async #getStats(): Promise<Stats> {
        const maxTries = 3;
        for (let x = 1; x <= maxTries; x += 1) {
            try {
                const json = await this.getRawJSON()
                return Stats.parse(json)
            } catch (e: unknown) {
                if (x < maxTries) {
                    // Silently retry:
                    await delay(100)
                    continue
                }
                throw e
            }
        }
        throw new Error("Shouldn't ever get here.")
    }

    /**
     * Get the next set of data from the router.
     * 
     * It seems like the router only ever updates this every 10sec, so
     * we'll retry until we see the data has changed, or 10sec has passed.
     */
    async getData(): Promise<Stats> {
        const delayMs = 500
        const maxWaitMs = 10_000

        // Wait until at least this time to start looking for new data.
        // shorter than maxWaitMs to allow us to catch up to clock drift,
        // and see new changes ASAP w/o too many queries.
        const minWaitMs = 9_000

        const prev = this.#lastFetch
        while (true) {
            const elapsedMs = Date.now() - (prev?.ts ?? 0)
            if (elapsedMs < minWaitMs) {
                await delay(minWaitMs - elapsedMs)
                continue
            }
            const newData = await this.#getStats()
            if (
                elapsedMs > maxWaitMs
                || prev == null 
                || !sameData(newData, prev.data)
            )
            {
                this.#lastFetch = {
                    ts: Date.now(),
                    data: newData
                }
                return newData
            }
            await delay(delayMs)
        } 
    }
}

function sameData(a: Stats, b: Stats): boolean {
    return (
           equal(a.signal["4g"], b.signal["4g"]) 
        && equal(a.signal["5g"], b.signal["5g"])
    )
}

type ClientArgs = {
    host: string
}

export const DeviceInfo = z.object({
    name: z.string(),
    macId: z.string(),
    manufacturer: z.string(),
    model: z.string(),
    role: z.enum(["gateway"]),
    serial: z.string(),
    softwareVersion: z.string(),
    type: z.string(), // known: "HSID"
    updateState: z.string(), // known values: "latest"
})

export type DeviceInfo = z.infer<typeof DeviceInfo>

// Could strictly type this to known bands?
export const BandName = z.string().min(1)

const Integer = z.number().int()

export const SignalInfo = z.object({
    bands: z.array(BandName).min(1),
    bars: Integer,
    cid: Integer,
    eNBID: Integer.optional(), // Don't want to die if this isn't present. I don't use it.

    rsrp: Integer.describe("Reference Signal Received Power"),
    rsrq: Integer.describe("Reference Signal Received Quality"),
    rssi: Integer.describe("Received Signal Strength Indicator"),
    sinr: Integer.describe("Signal Interference + Noise Ratio"),

})

export type SignalInfo = z.infer<typeof SignalInfo>

export const SignalMap = z.object({
    "4g": SignalInfo.optional(),
    "5g": SignalInfo.optional(),
    // There's a "generic" section here, but I don't care about it.
})

export type SignalMap = z.infer<typeof SignalMap>


export const Stats = z.object({
    device: DeviceInfo,
    signal: SignalMap
})

export type Stats = z.infer<typeof Stats>