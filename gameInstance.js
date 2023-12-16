const wrapper = new (require("./wrapper.js"))();
const constants = require("./constants.json")

class GameInstance {
    constructor(previewGame, clients, lobbyManager) {
        this.clients = clients;
        this.mode = previewGame.mode;
        this.isContest = previewGame.isContest;
        this.mapID = previewGame.mapID;
        this.mapSeed = previewGame.mapSeed;
        this.spawnSeed = Math.floor(Math.random() * constants.MAX_SPAWN_SEED);

        this.playerCount = this.clients.length;
        this.packetID = 0;
        this.pendingCommands = [];

        this.clients.forEach((client, index) => {
            client.playerID = index;
            client.ws.on('close', (code) => { // Remove the client from the list of clients
                this.clients.splice(this.clients.indexOf(client), 1);
                // Add pending command - player left game
                // use client.info.playerID
    
                // Delete game from lobbyManager.ongoingGames if there are no more clients
                if (this.clients.length === 0) {
                    lobbyManager.ongoingGames.delete(this);
                }
            });
        }) 
        this.updateInterval = null;
        this.distributeInit(lobbyManager);

        setTimeout(this.update, constants.packet.GAME_INIT_BUFFER)
    }

    update() {
        if (this.updateInterval === null) {
            // Start the update interval
            this.updateInterval = setInterval(update, constants.packet.PACKET_BUFFER_INTERVAL);
        }

        // Distribute commands to all clients
        //this.distribute();

    }

    getNewPacketID() {
        this.packetID += 1;
        if (this.packetID >= constants.packet.MAX_PACKET_ID) {
            this.packetID = 0;
        }
    }

    distributeInit(lobbyManager) {
        // Wrap the game init packet, then edit the bits for the playerID and send it to each client
        const array = wrapper.wrapGameInit(this, 0);
        const is1v1 = this.mode === 8;
        this.clients.forEach(client => {
            const newArray = this.copy(array);
            wrapper.index = 23;
            wrapper.setBits(newArray, is1v1 ? 1 : 9, client.playerID);
            client.ws.send(newArray);
            lobbyManager.clients.delete(client);
        });
    }

    distribute() {
        // this.getNewPacketID(), this.pendingCommands
    }

    copy(buffer) {
        const dst = new Uint8Array(buffer.byteLength);
        dst.set(new Uint8Array(buffer));
        return dst;
    }
}

module.exports = GameInstance;