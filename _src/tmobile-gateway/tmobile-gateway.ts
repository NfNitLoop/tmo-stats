/**
 * Utilities for fetching data from the t-mobile home internet gateway.
 * 
 * @module
 */

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

    async getData(): Promise<Stats> {
        const json = await this.getRawJSON()
        return Stats.parse(json)
    }
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


export const Stats = z.object({
    device: DeviceInfo,
    signal: SignalMap
})

export type Stats = z.infer<typeof Stats>