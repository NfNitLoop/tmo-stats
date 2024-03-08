/** Human-readable bandwidth speeds */
export function speed(bytesPerSecond: number): string {
    let value = bytesPerSecond * 8 // to bits!

    const units = ["bps", "Kbps", "Mbps", "Gbps"]
    while (units.length > 1 && value > 1000) {
        value = value / 1000
        units.shift()
    }

    return `${value.toPrecision(3)} ${units[0]}`
}