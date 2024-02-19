/**
 * Utilities for fetching data from the t-mobile home internet gateway.
 * 
 * @module
 */

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

    async getJSON() {
        const response = await fetch(this.#getUrl)
        const json = await response.json()
        return json
    }
}

type ClientArgs = {
    host: string
}