const strings = new (require('./strings.js'))()
const dbManager = new (require('./dbManager.js'))()
const Wrapper = require('./wrapper.js')
const GameInstance = require('./gameInstance.js')
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
        this.currentPreviewID = -1;
        this.ongoingGames = new Set();
    }

    assignLobby(client, request) {
        // Do some basic checks - such as if name is valid
        if (!strings.isValidName(request.name)) return client.ws.close(constants.errorCodes.invalidName);

        // Assign client to this lobby's set of clients
        this.clients.add(client);
        client.ws.on('close', (_) => { // Remove the client from the lobby's set when they disconnect
            this.clients.delete(client);
            if (client.timeoutInterval) {
                clearInterval(client.timeoutInterval)
                client.timeoutInterval = null;
            }
            // Search for clients in the preview games and remove them
            for (const previewGame of this.previewGames) {
                if (previewGame.clients.includes(client)) {
                    previewGame.clients.splice(previewGame.clients.indexOf(client), 1);
                }
            }

            // Clear all intervals if there are no players
            if (this.clients.size === 0) {
                this.previewGames = [];
                this.resetIntervals()
            }
        });

        // Assign client information to the client object
        client.info = {
            name: request.name,
            password: request.password,
            rgb: request.rgb,
            mwIDms: request.mwIDms,
            validHostName: request.validHostName,
            // Check password and load ELO to determine cursive name
            ELO: 0,
            cursiveName: false
        }

        dbManager.loadELO(client);

        // If there are no preview games in the lobby, generate them
        if (this.previewGames.length === 0) {
            this.generatePreviewGames();
        }
    }

    assignGame(client, request) {
        // See if game exists
        const game = this.previewGames.find((game) => game.previewID === request.previewID);
        if (!game) return null
        // If client is already in the game, remove them, otherwise add them
        if (game.clients.includes(client)) {
            game.clients.splice(game.clients.indexOf(client), 1);
        } else {
            // Remove client from all other games
            for (const previewGame of this.previewGames) {
                if (previewGame !== game && previewGame.clients.includes(client)) {
                    previewGame.clients.splice(previewGame.clients.indexOf(client), 1);
                }
            }
            game.clients.push(client);
        }
    }

    generatePreviewGames() {
        
        // Clear the preview interval before setting it again
        if (this.intervals.preview) {
            clearInterval(this.intervals.preview);
            this.intervals.preview = null;
        }

        // Generate preview games
        let contestExists = this.previewGames.findIndex((game) => game.isContest) >= 0;
        let nextPreviewTime = constants.preview.previewInterval / 1E3 + (this.previewGames.length > 0 ? this.previewGames[this.previewGames.length - 1].progress : 0);
        if (!contestExists) {
            for (let i = this.previewGames.length; i < constants.preview.MAX_PREVIEW_GAME_COUNT; i++) {
                const mode = this.getRandomMode();
                const previewGame = {
                    previewID: this.getNewPreviewID(),
                    mode,
                    isContest: !contestExists && mode <= constants.modes.TEAMS_MAX && Math.random() < constants.preview.MODE_WEIGHTS.CONTEST_CHANCE,
                    mapID: this.getRandomMapID(mode),
                    mapSeed: Math.floor(16384 * Math.random()),
                    nMaxPlayers: mode === constants.modes.DUEL ? 2 : 512,
                    progress: nextPreviewTime,
                    clients: [],
                    clans: []
                }
                this.previewGames.push(previewGame);
                if (previewGame.isContest) {
                    contestExists = true;
                    break;
                }
                nextPreviewTime += 7;
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

        // Clear the update interval before setting it again
        if (this.intervals.update) {
            clearInterval(this.intervals.update);
        }

        // Update preview games

        for (let i = this.previewGames.length - 1; i >= 0; i--) {
            const previewGame = this.previewGames[i];
            previewGame.progress -= 1;
            if (previewGame.progress <= 0) {
                // Remove this game, and instantiate a new game to the set of games
                this.previewGames.splice(i, 1);
                this.instantiateGame(previewGame);
            }
            // Update clan information
            if (previewGame.mode <= constants.modes.TEAMS_MAX) {
                previewGame.clans = [];
                for (const client of previewGame.clients) {
                    const clanName = strings.isValidClan(client.info.name);
                    if (clanName) {
                        const clan = previewGame.clans.find((clan) => clan.name === clanName);
                        if (clan) {
                            clan.count += 1;
                        } else {
                            previewGame.clans.push({ name: clanName, count: 1 });
                        }
                    }
                }
                previewGame.clans.sort((a, b) => b.count - a.count);
            }
        }

        // Send preview games to clients
        for (const client of this.clients) {
            const message = new Wrapper().wrapLobby(this.clients, this.previewGames);
            client.ws.send(message);
        }

        // Clear all intervals if there are no players
        if (this.clients.size === 0) {
            this.resetIntervals()
        }

        this.intervals.update = setInterval(() => {
            this.updatePreviewGames();
        }, constants.preview.updateInterval);
    }

    instantiateGame(previewGame) {

        if (previewGame.mode === constants.modes.DUEL) {
            // Sort clients by ELO then by order of game selection
            const originalClients = [...previewGame.clients];
            const sortedClients = originalClients.sort((a, b) => {
                if (a.info.ELO === b.info.ELO) {
                    return originalClients.indexOf(a) - originalClients.indexOf(b);
                }
                return b.info.ELO - a.info.ELO;
            });
    
            // Pair players and create game instances
            while (sortedClients.length >= 2) {
                const clients = sortedClients.splice(0, 2);
                const gameInstance = new GameInstance(previewGame, clients, this);
                this.ongoingGames.add(gameInstance);
            }
        } else {
            const sortedClients = previewGame.clients.slice(0, previewGame.nMaxPlayers);
            if (sortedClients.length >= 1) {
                const gameInstance = new GameInstance(previewGame, sortedClients, this);
                this.ongoingGames.add(gameInstance);
            }
        }

        if (this.previewGames.length < constants.preview.MAX_PREVIEW_GAME_COUNT) {
            this.generatePreviewGames();
        }
    }

    getRandomMode() {
        const probi = Math.random();
        if (probi < constants.preview.MODE_WEIGHTS.DUEL_CHANCE) {
            return constants.modes.DUEL;
        } else if (probi < constants.preview.MODE_WEIGHTS.DUEL_CHANCE + constants.preview.MODE_WEIGHTS.FFA_CHANCE) {
            return Math.random() < constants.preview.MODE_WEIGHTS.NFS_FFA_CHANCE ? constants.modes.NFS : constants.modes.FFA
        } else if (probi < constants.preview.MODE_WEIGHTS.DUEL_CHANCE + constants.preview.MODE_WEIGHTS.FFA_CHANCE + constants.preview.MODE_WEIGHTS.ZOMBIE_CHANCE) {
            return constants.modes.ZOMBIE;
        } else {
            return Math.floor((constants.modes.TEAMS_MAX + 1) * Math.random())
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

    getNewPreviewID() {
        this.currentPreviewID++;
        if (this.currentPreviewID > constants.preview.MAX_PREVIEW_ID) {
            this.currentPreviewID = 0;
        }
        return this.currentPreviewID;
    }

    resetIntervals() {
        clearInterval(this.intervals.preview);
        clearInterval(this.intervals.update);
        this.intervals.preview = null;
        this.intervals.update = null;
    }
}

module.exports = LobbyManager;