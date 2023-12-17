const constants = require("./constants.json")
const sqlite3 = require("sqlite3").verbose()
const Wrapper = require("./wrapper.js")

class DBManager {

    async getIndex(db, position) {
        return new Promise((resolve, reject) => {
            position -= 4096;

            db.get(`SELECT COUNT(*) FROM ${constants.db.tables[0]}`, (err, row) => {
                if (err) {
                    reject(err);
                }

                const rowCount = row["COUNT(*)"];
                const pageCount = Math.ceil(rowCount / 10);

                // Overflow back to the start
                while (position >= pageCount) {
                    position -= pageCount;
                }

                // Overflow back to the end
                while (position < 0) {
                    position += pageCount;
                }

                // Resolve the Promise with the adjusted position
                resolve(position);
            });
        });
    }

    handleLoadSite(client) {
        const db = new sqlite3.Database(constants.db.path)
        // Get the best player and best clan (highest point)
        db.get(`SELECT NAME FROM ${constants.db.tables[0]} ORDER BY POINTS DESC LIMIT 1`, (err, row) => {
            if (err) {
                return console.log(err)
            }

            const bestPlayer = row.NAME

            db.get(`SELECT NAME FROM ${constants.db.tables[1]} ORDER BY POINTS DESC LIMIT 1`, (err, row) => {
                if (err) {
                    return console.log(err)
                }

                const bestClan = row.NAME

                // Send the site data
                client.ws.send(new Wrapper().wrapSite(bestPlayer, bestClan));
                db.close()
            });
        });
    }

    handleLoadLeaderboard(client, request) {

        // Request 1v1 leaderboard from sql
        const db = new sqlite3.Database(constants.db.path)
        this.getIndex(db, request.position).then((position) => {
            db.all(`SELECT NAME, POINTS FROM ${constants.db.tables[request.id]} LIMIT 10 OFFSET ?`, [position * 10], (err, rows) => {
                if (err) {
                    return console.log(err)
                }

                // Send the leaderboard
                const message = new Wrapper().wrapLeaderboard(request.id, position, rows);
                client.ws.send(message);

                db.close()
            });
        }).catch((err) => {
            return console.log(err)
        });
    }

    loadELO(client) {
        const db = new sqlite3.Database(constants.db.path)
        db.get(`SELECT POINTS, NAME FROM ${constants.db.tables[0]} WHERE PASSWORD = ?`, [client.info.password], (err, row) => {
            if (err) {
                return console.log(err)
            }
    
            if (row) {
                client.info.ELO = row.POINTS;
                client.info.name = row.NAME;
    
                // Check if the client has the highest ELO
                db.get(`SELECT MAX(POINTS) as maxPoints, PASSWORD FROM ${constants.db.tables[0]}`, (err, maxRow) => {
                    if (err) {
                        return console.log(err)
                    }
    
                    if (maxRow.PASSWORD === client.info.password) {
                        client.info.cursiveName = true;
                    }
    
                    db.close();
                });
            } else {
                db.close();
            }
        });
    }

    flagAccounts(passwords) {
        const db = new sqlite3.Database(constants.db.path)
        const placeholders = passwords.map(() => '?').join(',');
        const sql = `UPDATE ${constants.db.tables[1]} SET FLAGGED = FLAGGED + 1 WHERE PASSWORD IN (${placeholders})`
        db.run(sql, passwords, (err) => {
            if (err) {
                return err // Might not exist
            }
            db.close()
        });
    }

    addClanWin(clan, playerCount, mapID, isContest) {

    }

    addFFAWin(winnerInfo, playerCount, mapID) {

    }

    add1v1Win(winnerInfo, loserInfo) {

        const db = new sqlite3.Database(constants.db.path)
    
        db.serialize(() => {
            db.get(`SELECT POINTS FROM ${constants.db.tables[0]} WHERE PASSWORD = ?`, [winnerInfo.password], (err, winnerRow) => {
                if (err) {
                    return console.log(err)
                }
    
                db.get(`SELECT POINTS FROM ${constants.db.tables[0]} WHERE PASSWORD = ?`, [loserInfo.password], (err, loserRow) => {
                    if (err) {
                        return console.log(err)
                    }
    
                    let winnerELO = winnerRow ? winnerRow.POINTS : 0;
                    let loserELO = loserRow ? loserRow.POINTS : 0;
    
                    let dif = (winnerELO - loserELO) / 10;
                    let gain = 8 / (1 + Math.pow(2, dif / 32));
                    gain = Math.floor(10 * gain + 0.5);
                    let newWinnerELO = winnerELO + gain + 1;
                    let newLoserELO = loserELO - gain;
    
                    if (newWinnerELO > 0) {
                        db.run(`INSERT OR IGNORE INTO ${constants.db.tables[0]} (PASSWORD, POINTS, NAME, GAMESPLAYED, FLAGS) VALUES (?, ?, ?, 0, 0)`, [winnerInfo.password, newWinnerELO, winnerInfo.name]);
                        db.run(`UPDATE ${constants.db.tables[0]} SET POINTS = ?, NAME = ?, GAMESPLAYED = GAMESPLAYED + 1 WHERE PASSWORD = ?`, [newWinnerELO, winnerInfo.name, winnerInfo.password]);
                    } else {
                        db.run(`DELETE FROM ${constants.db.tables[0]} WHERE PASSWORD = ?`, [winnerInfo.password]);
                    }

                    if (newLoserELO > 0) {
                        db.run(`INSERT OR IGNORE INTO ${constants.db.tables[0]} (PASSWORD, POINTS, NAME, GAMESPLAYED, FLAGS) VALUES (?, ?, ?, 0, 0)`, [loserInfo.password, newLoserELO, loserInfo.name]);
                        db.run(`UPDATE ${constants.db.tables[0]} SET POINTS = ?, NAME = ?, GAMESPLAYED = GAMESPLAYED + 1 WHERE PASSWORD = ?`, [newLoserELO, loserInfo.name, loserInfo.password]);
                    } else {
                        db.run(`DELETE FROM ${constants.db.tables[0]} WHERE PASSWORD = ?`, [loserInfo.password]);
                    }
    
                    db.close();
                });
            });
        });

    }

    addZombieWin(winnerInfo, playerCount, mapID) {
        
    }
}

module.exports = DBManager;