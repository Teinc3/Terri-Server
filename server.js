const unwrapper = new (require("./unwrapper.js"))()
const leaderboard = new (require("./leaderboard.js"))()
const constants = require("./constants.json")

class WSServer {
    constructor(server) {
        this.server = server
        this.clients = new Set()
        this.publicLobby = null
        this.lobbies = new Set() // Private, user-created
        this.sessionID = 0;

        server.on('connection', (ws, req) => this.onConnection(ws))
    }

    onConnection(ws) {
        // Assign a new client instance
        const client = {
            ws,
            sessionID: this.sessionID += 1,
            timeoutInterval: null,
            lastAction: null
        }
        this.handleTimeoutInterval(client, null);
        this.clients.add(client)

        ws.on('message', (m) => {
            // Rejected if the message is not a buffer
            if (!(m instanceof Buffer)) return ws.close(4300)

            // Unwrap the request
            const request = unwrapper.unwrap(m)

            // Handle the request
            switch (request.action) {
                case "HEARTBEAT":
                    break
                case "LEADERBOARD":
                    leaderboard.handleLoadLeaderboard(client, request)
                    break
                case "LOBBY":
                    break;
                case "ERROR":
                    return
            }

            // Update the last action
            client.lastAction = request.action

            this.handleTimeoutInterval(client, request.action)
        });
        
        ws.on('close', (code) => {
            this.clients.delete(client)
            if (client.timeoutInterval) {
                clearInterval(client.timeoutInterval)
            }
        });
    }

    handleTimeoutInterval(client, action) {
        // If heartbeat and last client action is load site or leaderboard, ignore
        if (action === "HEARTBEAT" && (client.lastAction === "SITE" || client.lastAction === "LEADERBOARD")) {
            return
        }
        
        // Clear the previous interval
        if (client.timeoutInterval) {
            clearInterval(client.timeoutInterval)
        }
        // Set the new interval
        client.timeoutInterval = setInterval(() => {
            client.ws.close(constants.errorCodes.MAX_WS_TOLERANCE_REACHED)
        }, constants.MAX_WS_TOLERANCE)
    }


}

module.exports = WSServer