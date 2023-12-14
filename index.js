const express = require("express")
const http = require("http")
const Websocket = require("ws")
const WSServer = require("./server")

const app = express()
    const port = process.argv[2] || 443
const server = http.createServer(app)

const wsServer = new WSServer(new Websocket.WebSocketServer({ server }))

app.get('/', (req, res) => {
    res.redirect("https://territorial.io")
})

server.listen(port, () => console.log('Listening on port ' + port))