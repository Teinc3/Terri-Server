const unwrapper = new (require("./unwrapper.js"))()
const leaderboard = new (require("./leaderboard.js"))()
const constants = require("./constants.json")

class WSServer {
    constructor(server) {
        this.server = server
        this.clients = new Set()
        this.ongoingGames = new Set()
        this.lobby = new Set()
        this.sessionID = 0;

        server.on('connection', (ws, req) => this.onConnection(ws))
    }

    onConnection(ws) {
        // Assign a new client instance
        const client = {
            ws,
            sessionID: this.sessionID += 1,
            heartbeatInterval: null,
        }
        this.clients.add(client)

        ws.on('message', (m) => {
            // Rejected if the message is not a buffer
            if (!(m instanceof Buffer)) return ws.close(4300)

            // Unwrap the request
            const request = unwrapper.unwrap(m)

            // Handle the request
            switch (request.action) {
                case "HEARTBEAT":
                    this.handleHeartbeat(client)
                    break
                case "LEADERBOARD":
                    leaderboard.handleLoadLeaderboard(client, request)
                    break
                case "ERROR":
                    break
            }
        });
    }

    handleHeartbeat(client) {

        // Clear the previous interval
        if (client.heartbeatInterval) {
            clearInterval(client.heartbeatInterval)
        }
        // Set the new interval
        client.heartbeatInterval = setInterval(() => {
            client.ws.close(constants.errorCodes.MAX_HEARTBEAT_TOLERANCE_REACHED)
        }, constants.MAX_HEARTBEAT_TOLERANCE)
    }


}

module.exports = WSServer