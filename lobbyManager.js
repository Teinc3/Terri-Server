const strings = new (require('./strings.js'))()
const wrapper = new (require('./wrapper.js'))()
const constants = require("./constants.json")

class LobbyManager {
    constructor() {
        this.previewGames = [];
        this.clients = new Set();
        this.intervals = {
            preview: null,
            update: null
        }
        this.previewInterval = null;
        this.currentGameID = -1;
        this.games = new Set();
    }

    assignLobby(client, request) {
        // Do some basic checks - such as if name is valid
        if (!strings.isValidName(request.name)) return client.ws.close(constants.errorCodes.invalidName);

        // Assign client to this lobby's set of clients
        this.clients.add(client);
        client.ws.on('close', (code) => { // Remove the client from the lobby's set when they disconnect
            this.clients.delete(client);
            if (client.timeoutInterval) {
                clearInterval(client.timeoutInterval)
            }
            if (this.clients.size === 0) {
                clearInterval(this.intervals.preview);
                clearInterval(this.intervals.update);
            }
        });

        // Assign client information to the client object
        client.info = {
            name: request.name,
            password: request.password,
            rgb: request.rgb,
            mwIDms: request.mwIDms,
            validHostName: request.validHostName
        }

        // If there are no preview games in the lobby, generate them
        if (this.previewGames.length === 0) {
            this.generatePreviewGames();
        }
    }

    generatePreviewGames() {
        
        // Clear the preview interval before setting it again
        if (this.intervals.preview) {
            clearInterval(this.intervals.preview);
        }

        // Generate preview games
        let contestExists = this.previewGames.findIndex((game) => game.isContest) >= 0 ;
        if (!contestExists) {
            for (let i = this.previewGames.length; i < constants.preview.MAX_PREVIEW_GAME_COUNT; i++) {
                const mode = this.getRandomMode();
                const previewGame = {
                    gameID: this.getNewGameID(),
                    mode,
                    isContest: !contestExists && mode <= constants.modes.TEAMS_MAX && Math.random() < constants.preview.MODE_WEIGHTS.CONTEST_CHANCE,
                    mapID: this.getRandomMapID(mode),
                    mapSeed: Math.floor(16384 * Math.random()),
                    nMaxPlayers: mode === constants.modes.DUEL ? 2 : 512,
                    progress: constants.PREVIEW_TTL,
                    clients: [],
                    clans: []
                }
                this.previewGames.push(previewGame);
                if (previewGame.isContest) {
                    contestExists = true;
                    break;
                }
            }
        }

        if (!this.intervals.update) {
            this.updatePreviewGames();
        }

        this.intervals.preview = setInterval(() => {
            this.generatePreviewGames();
        }, constants.preview.previewInterval);
    }

    updatePreviewGames() {

        // Update preview games
        for (const previewGame of this.previewGames) {
            previewGame.progress -= 1;
            if (previewGame.progress <= 0) {
                // Remove this game, and instantiate a new game to the set of games
                this.previewGames.splice(this.previewGames.indexOf(previewGame), 1);
                // ...
                // Then we will remove the player from receiving preview games packets
                // ...


                // See if we need to call generatePreviewGames() to fill up the preview games
            }
        }
        // Send preview games to clients
        for (const client of this.clients) {
            const message = wrapper.wrapLobby(this.clients, this.previewGames);
            client.ws.send(message);
        }

        // Clear all intervals if there are no players
        if (this.clients.size === 0) {
            clearInterval(this.intervals.preview);
            clearInterval(this.intervals.update);
        }

        // Clear the update interval before setting it again
        if (this.intervals.update) {
            clearInterval(this.intervals.update);
        }

        this.intervals.update = setInterval(() => {
            this.updatePreviewGames();
        }, constants.preview.updateInterval);
    }

    getRandomMode() {
        const probi = Math.random();
        switch (probi) {
            case probi < constants.preview.MODE_WEIGHTS.DUEL_CHANCE: {
                return constants.modes.DUEL;
            }
            case probi < constants.preview.MODE_WEIGHTS.DUEL_CHANCE + constants.preview.MODE_WEIGHTS.FFA_CHANCE: {
                return Math.random() < constants.preview.MODE_WEIGHTS.NFS_FFA_CHANCE ? constants.modes.NFS : constants.modes.FFA
            }
            case probi < constants.preview.MODE_WEIGHTS.DUEL_CHANCE + constants.preview.MODE_WEIGHTS.FFA_CHANCE + constants.preview.MODE_WEIGHTS.ZOMBIE_CHANCE: {
                return constants.modes.ZOMBIE;
            }
            default: {
                return Math.floor((constants.modes.TEAMS_MAX + 1) * Math.random())
            }
        }
    }

    getRandomMapID(mode) {
        switch (mode) {
            case constants.modes.DUEL: {
                const probi = Math.random();
                if (probi < constants.preview.MAP_WEIGHTS.DUEL["1"]) {
                    return 1;
                } else {
                    // Generate an array of all possible maps, filter out those in NONE, and pick a random one
                    const maps = Array.from(Array(constants.mapCount).keys())
                        .filter((map) => !constants.preview.MAP_WEIGHTS.DUEL.NONE.includes(map));
                    return maps[Math.floor(maps.length * Math.random())];
                }
            }
            case constants.modes.ZOMBIE: {
                // 50% World, Random rest
                const probi = Math.random();
                if (probi < constants.preview.MAP_WEIGHTS.ZOMBIE["11"]) {
                    return 11;
                } else {
                    // Generate an array of all possible maps, filter out those in NONE, and pick a random one
                    const maps = Array.from(Array(constants.mapCount).keys())
                        .filter((map) => !constants.preview.MAP_WEIGHTS.ZOMBIE.NONE.includes(map));
                    return maps[Math.floor(maps.length * Math.random())];
                }
            }
            default: { // No bias
                return Math.floor(constants.mapCount * Math.random());
            }
        }
    }

    getNewGameID() {
        this.currentGameID++;
        if (this.currentGameID >= 16) {
            this.currentGameID = 0;
        }
        return this.currentGameID;
    }
}

module.exports = LobbyManager;