import { WebSocketServer } from 'ws'
import Player from './player.js'
import GameRoom from './gameroom.js'

const port = process.env.PORT || 8080
const wss = new WebSocketServer({ port: port })

const game_rooms = {}
const active_connections = new Map()

var running_id = 1

function join_room(ws, join_room_json) {
  // Check if jsonObj is an object
  if (typeof join_room_json !== 'object' || join_room_json === null) {
    console.log("join_room_json is not an object")
    return false
  }
  // Check if 'room_id' and 'deck_id' fields exist in the object
  if (!('room_id' in join_room_json && 'deck_id' in join_room_json)) {
    console.log("join_room_json does not have 'room_id' and 'deck_id' fields")
    return false
  }
  if (!(typeof join_room_json.room_id === 'string' && typeof join_room_json.deck_id === 'string')) {
    console.log("join_room_json 'room_id' and 'deck_id' fields are not strings")
    return false
  }

  var player = active_connections.get(ws)
  if (player === undefined) {
    console.log("Player is undefined")
    return false
  }

  if ('player_name' in join_room_json && typeof join_room_json.player_name === 'string') {
    set_name(player, join_room_json.player_name)
  }

  var deck_id = join_room_json.deck_id
  var room_id = join_room_json.room_id
  var player = active_connections.get(ws)
  player.set_deck_id(deck_id)
  var success = false
  if (game_rooms.hasOwnProperty(room_id)) {
    const room = game_rooms[room_id]
    success = room.join(player)
  } else {
    const new_room = new GameRoom(room_id)
    new_room.join(player)
    game_rooms[room_id] = new_room
    success = true
  }

  if (!success) {
    const message = {
      type: 'room_join_failed',
      reason: 'Room is full'
    }
    ws.send(JSON.stringify(message))
  }

  return true
}

function handle_disconnect(ws) {
  const player = active_connections.get(ws)
  console.log(`Player ${player.name} disconnected`)
  for (const room_id in game_rooms) {
    const room = game_rooms[room_id]
    if (room.players.includes(player)) {
      room.player_disconnect(player)
      console.log("Closing room " + room_id)
      delete game_rooms[room_id]
      break
    }
  }
  active_connections.delete(ws)
}

function already_has_player_with_name(name) {
  for (const player in active_connections.values()) {
    if (player.name == name) {
      return true
    }
  }
  return false
}

function set_name(player, desired_name) {
  var name_to_set = desired_name
  while (already_has_player_with_name(desired_name)) {
    name_to_set = desired_name + "_" + running_id++
  }
  player.set_name(name_to_set)
  console.log("Player name set to " + name_to_set)
}

wss.on('connection', function connection(ws) {
  var new_player_id = running_id++
  var player_name = "Anon_" + new_player_id
  const player = new Player(ws, new_player_id, player_name)
  active_connections.set(ws, player)

  ws.on('message', function message(data) {
    var handled = false
    try {
      const json_data = JSON.parse(data)
      const message_type = json_data.type
      if (message_type == 'join_room') {
        handled = join_room(ws, json_data)
      } else if (message_type == "set_name") {
        set_name(player, json_data.name)
        handled = true
      }
    }
    catch (e) {
      console.log(e)
    }
    if (!handled) {
      console.log('received: %s', data)
      ws.send('I got your: ' + data)
    }
  })

  ws.on('close', () => {
    handle_disconnect(ws)
  })

  const message = {
    type: 'server_hello',
    player_name: player_name
  }
  ws.send(JSON.stringify(message))
})

console.log("Server started on port " + port + ".")