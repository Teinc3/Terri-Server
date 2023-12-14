const constants = require("constants.json")
const sqlite3 = require("sqlite3").verbose()
const wrapper = new (require("wrapper"))()

class Leaderboard {

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

            // Close the database connection after the operation
            db.close();
        });
    }

    handleLoadLeaderboard(client, request) {
        if (request.mwCode !== constants.mwCode) {
            return client.ws.close(constants.errorCodes.mwCodeError_LB)
        }

        // Request 1v1 leaderboard from sql
        const db = new sqlite3.Database(constants.db.path)
        this.getIndex(db, request.position).then((position) => {
            db.all(`SELECT NAME, ELO FROM ${constants.db.tables[0]} LIMIT 10 OFFSET ${position * 10}`, (err, rows) => {
                if (err) {
                    return null
                }

                // Send the leaderboard
                const message = wrapper.wrapLeaderboard(request.id, position, rows);
                client.ws.send(message);

                db.close()
            });
        }).catch((err) => {
            return null
        });
    }
}

module.exports = Leaderboard;