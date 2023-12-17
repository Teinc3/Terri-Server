const Wrapper = require("./wrapper.js");
const dbManager = new (require("./dbManager.js"))();
const constants = require("./constants.json")
const strings = new (require("./strings.js"))();

class GameInstance {
    constructor(previewGame, clients, lobbyManager) {
        this.clients = clients;
        this.mode = previewGame.mode;
        this.isContest = previewGame.isContest;
        this.mapID = previewGame.mapID;
        this.mapSeed = previewGame.mapSeed;
        this.spawnSeed = Math.floor(Math.random() * constants.MAX_SPAWN_SEED);

        this.playerCount = this.clients.length;
        this.packetID = -1;
        this.pendingCommands = [];

        this.gameEnded = false;
        this.resultCount = 0;
        this.eligibleVoters = this.playerCount;
        this.results = {};

        this.clients.forEach((client, index) => {
            client.playerID = index;
            client.gameInstance = this;
            client.ws.on('close', (_) => { // Remove the client from the list of clients
                this.clients.splice(this.clients.indexOf(client), 1);
                // Add pending command - player left game
                this.pendingCommands.push({
                    type: "disconnect",
                    playerID: client.playerID
                });
                // If the game has ended, update the game so that the remaining clients can see the disconnect packet
                if (this.gameEnded) {
                    this.update();
                } else if (this.resultCount > 0) { // If the game has not ended, check if the client has voted
                    // If the client did not send an endGame packet, decrement eligibleVoters
                    const voted = (playerID) => {
                        for (let key in this.results) {
                            if (this.results[key].includes(playerID)) {
                                return true;
                            }
                        }
                        return false;
                    }
                    if (!voted(client.playerID)) {
                        this.eligibleVoters -= 1;
                    }
                }
    
                // Delete game from lobbyManager.ongoingGames if there are no more clients
                if (this.clients.length === 0) {
                    lobbyManager.ongoingGames.delete(this);
                }
            });
        })
        this.clientInfo = this.clients.map(client => {
            return {
                ...client.info,
                playerID: client.playerID
            }
        });
        this.updateInterval = null;
        this.distributeInit(lobbyManager);

        setTimeout(() => this.update(), constants.packet.GAME_INIT_BUFFER)
    }

    update() {
        if (this.updateInterval === null && !this.gameEnded) {
            // Start the update interval
            this.updateInterval = setInterval(() => this.update(), constants.packet.PACKET_BUFFER_INTERVAL);
        }

        // Distribute commands to all clients
        const message = new Wrapper().wrapPublicCommands(this.getNewPacketID(), this.pendingCommands);
        this.clients.forEach(client => {
            client.ws.send(message);
        });
        this.pendingCommands = [];
    }

    getNewPacketID() {
        this.packetID += 1;
        if (this.packetID >= constants.packet.PACKET_ID_COUNT) {
            this.packetID = 0;
        }
        return this.packetID;
    }

    distributeInit(lobbyManager) {
        // Wrap the game init packet, then edit the bits for the playerID and send it to each client
        const wrapper = new Wrapper();
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

    getPrivateCommand(request) {
        const wrapper = new Wrapper();
        switch (request.type) {
            case "PRIVATE_EMOJI": {
                const client = this.clients.find(client => client.playerID === request.targetID);
                if (client) {
                    client.ws.send(wrapper.wrapPrivateEmoji(request.playerID, request.emojiID));
                }
                break;
            }
            case "NON_AGGRESSION": {
                const client = this.clients.find(client => client.playerID === request.targetID);
                if (client) {
                    client.ws.send(wrapper.wrapNonAggressionPact(request.playerID));
                }
                break;
            }
            case "ORDER": {
                const array = wrapper.wrapOrder(request.playerID, request.targetID);
                this.clients.forEach(client => {
                    if (request.receiverIDs.includes(client.playerID)) {
                        client.ws.send(array)
                    }
                })
                break;
            }
        }
    }

    endGame(request) { // This is funny because I didn't even use the hash
        this.resultCount += 1;
        if (request.type === "WIN") {
            // If winnerID is already in the results, add the playerID to the array, otherwise create a new array
            if (this.results.hasOwnProperty(request.winnerID)) {
                this.results[request.winnerID].push(request.playerID);
            } else {
                this.results[request.winnerID] = [request.playerID];
            }
        } else {
            // Concat stalemate array into p0,p1,p2 string
            request.winnerID = request.winnerIDs.reduce((acc, winnerID) =>  acc + winnerID.toString() + ",", "").slice(0, -1);
            if (this.results.hasOwnProperty(request.winnerID)) {
                this.results[request.winnerID].push(request.playerID);
            } else {
                this.results[request.winnerID] = [request.playerID];
            }
        }

        // We start counting the number of connected clients when we receive our first "endGame" packet
        if (this.resultCount === 1) {
            this.eligibleVoters = this.clients.length;
        } else if (this.resultCount >= 1 && this.resultCount >= constants.win.ENDGAME_CONFIDENCE * this.eligibleVoters) {
            // If at least 90% of all eligible voters have sent an endGame packet, end the game
            this.gameEnded = true;
            clearInterval(this.updateInterval);
            
            // Take the array with the largest length
            const resultArray = Object.values(this.results);
            let maxArray = [];
            for (let array of resultArray) {
                if (array.length > maxArray.length) {
                    maxArray = array;
                }
            }
            // if 80% of all voted players voted for the same player, end the game
            if (maxArray.length >= constants.win.WINNER_CONFIDENCE * this.eligibleVoters) {
                // Get the winnerID (key) from the results object
                let winnerID;
                for (let key in this.results) {
                    if (this.results[key] === maxArray) {
                        winnerID = key;
                        break;
                    }
                }
                this.winnerConfirmed(winnerID);
            } else {
                if (this.mode === 8) {
                    // If both players vote opposite then we suspect someone is cheating
                    // Flag the accounts that have their playerIDs in the array of result winnerID attribute
                    let flaggedPasswords = [];
                    if (this.results.hasOwnProperty("0")) {
                        flaggedPasswords.push(this.clients.find(client => client.playerID === 0).info.password)
                    }
                    if (this.results.hasOwnProperty("1")) {
                        flaggedPasswords.push(this.clients.find(client => client.playerID === 1).info.password)
                    }
                    dbManager.flagAccounts(flaggedPasswords);
                } else {
                    // We just don't confirm a winner and discard the game
                }
            }
        }

    }

    copy(buffer) {
        const dst = new Uint8Array(buffer.byteLength);
        dst.set(new Uint8Array(buffer));
        return dst;
    }

    winnerConfirmed(winnerID) {
        // If winnerID is a string, it is a stalemate
        if (winnerID.includes(",")) {
            // Split the string into an array of playerIDs
            // noinspection JSCheckFunctionSignatures
            winnerID = winnerID.split(",").map(playerID => parseInt(playerID));
        } else {
            winnerID = parseInt(winnerID);
            const winner = this.clientInfo.find(info => info.playerID === winnerID);
            if (this.mode <= constants.modes.TEAMS_MAX) {
                // Take the clan of the winner
                let clan = strings.isValidClan(winner.name);
                if (clan) {
                    dbManager.addClanWin(clan, this.playerCount, this.mapID, this.isContest);
                }
            } else if (this.mode === constants.modes.FFA || this.mode === constants.modes.NFS) {
                // Add a win to the winner's account
                dbManager.addFFAWin(winner.name, this.playerCount, this.mapID);
            } else if (this.mode === constants.modes.DUEL) {
                // Add a win to the winner's account
                dbManager.add1v1Win(winner, this.clientInfo[1 - winner.playerID]);
            } else { // ZOMBIES
                // If the winner is not a zombie
                if (winner !== -1) {
                    dbManager.addZombieWin(winner.name, this.playerCount)
                }
            }
        }
    }
}

module.exports = GameInstance;