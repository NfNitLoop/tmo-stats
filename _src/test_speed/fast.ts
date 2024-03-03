/**
 * Broken.
 * Process doesn't end. It may have started up an async background task. :(
 */

import FastSpeedtest from "npm:fast-speedtest-api@0.3.2"

type Options = {
    token: string, // required
    
    /** default: false */
    verbose?: boolean,
    
    /** default: 5000 */
    timeout?: number,
    
    /** default: true */
    https?: true,
    
    /** default: 5 */
    urlCount?: number,
    
    /** default: 8 */
    bufferSize?: number,
    
    /** default: Bps */
    unit?: FastSpeedtest.UNITS
}

async function main() {
    const opts: Options = {
        token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
        verbose: true,
        unit: FastSpeedtest.UNITS.Mbps
    }
    const test = new FastSpeedtest(opts)
    const results = await test.getSpeed()
    console.log({results})
}

if (import.meta.main) {
    await main()
}