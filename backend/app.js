const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const imageRouter = require("./routes/image");
const roomsRouter = require("./routes/rooms");
const {
  createEmptyGrid,
  rooms,
  updateGrid,
  createSolutionGrid,
} = require("./modules/painting");

const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server, {
  cors: {
    origin: process.env.CLIENT_URI,

    methods: ["GET", "POST"],
  },
});

mongoose.connect(process.env.DATABASE_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error: "));
db.once("open", function () {
  console.log("Connected successfully");
});

app.use(cors());
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/image", imageRouter);
app.use("/rooms", roomsRouter);

io.on("connection", (socket) => {
  console.log("Någonting");
  socket.on("saveUser", (arg) => {
    socket.userName = arg;
    socket.userColor = "#" + Math.floor(Math.random() * 16777215).toString(16);

    let user = {
      userName: socket.userName,
      userId: socket.id,
      userColor: socket.userColor,
    };

    console.log({ user });
    io.emit("saveUser", { user });
  });

  // socket.emit("message", { message: "Hello from the server!" });

  // socket.emit("message", "Hello");
  // socket.on("saveUser", (arg) => {
  //   socket.userName = arg;
  //   socket.userColor = "#" + Math.floor(Math.random() * 16777215).toString(16);

  //   let users = [];

  //   let user = {
  //     userName: socket.userName,
  //     userId: socket.id,
  //     userColor: socket.userColor,
  //   };

  //   users.push(user);
  //   console.log(users);

  //   io.emit("saveUser", { user });
  // });

  // socket.on("chat", (arg) => {
  //   socket.userMessage = arg;

  //   let chatMessage = {
  //     userColor: socket.userColor,
  //     userName: socket.userName,
  //     userMessage: socket.userMessage,
  //   };

  //   io.emit("chat", { chatMessage });
  // });

  /*****************************************************************************
   *************************** SOCKET CHAT ************************************
   *****************************************************************************/
  console.log("someone is here");

  socket.emit("message", { message: "Hello world", user: "Server says" });

  socket.on("message", (arg) => {
    console.log("Incoming chat", arg);
    io.emit("message", arg);
  });

  socket.on("create room", (user) => {
    const startGrid = createEmptyGrid();
    const roomUsers = [];

    const room = {
      grid: startGrid,
      users: roomUsers,
      roomId: uuidv4(),
      colors: ["red", "blue", "green", "yellow"],
    };

    const colorIndex = Math.floor(Math.random() * room.colors.length - 1);

    const assignedColor = room.colors.splice(colorIndex, 1)[0];

    user.color = assignedColor;

    roomUsers.push(user);

    rooms.push(room);

    io.emit("create room", room);
    io.emit("monitorRooms");
  });

  socket.on("joinRoom", (userAndRoomId) => {
    const roomToJoin = rooms.find(
      (room) => room.roomId == userAndRoomId.roomId
    );

    const colorIndex = Math.floor(Math.random() * roomToJoin.colors.length - 1);

    const assignedColor = roomToJoin.colors.splice(colorIndex, 1)[0];

    userAndRoomId.user.color = assignedColor;

    roomToJoin.users.push(userAndRoomId.user);

    console.log(roomToJoin.users.length);

    if (roomToJoin.users.length > 3) {
      roomToJoin.isFull = true; // ej färdig!!
    }

    console.log(roomToJoin);

    io.emit("joinRoom", roomToJoin);
    io.emit("monitorRooms");
  });

  socket.on("paint", (cellObject) => {
    // {roomId: room.roomId, cellId: e.target.id, color: user.color});
    const updatedCell = updateGrid(cellObject);
    io.emit("paint", updatedCell);
  });

  let colors = [];

  socket.on("addColor", (arg) => {
    socket.color = arg;

    colors.push(socket.color);

    console.log(colors);
    io.emit("updateColors", colors);
  });

  socket.on("removeColor", (arg) => {
    socket.color = arg;

    colors.pop(socket.color);

    io.emit("updateColors", colors);
  });

  socket.on("readyCheck", (roomAndUser) => {
    const room = rooms.find((room) => room.id == roomAndUser.room.id);
    const user = room.users.find((user) => user.id == user.id);

    user.ready = true;

    const allAreReady = room.users.every((user) => user.ready === true);

    if (allAreReady) {
      const solutionGrid = createSolutionGrid(room.users);

      room.solutionGrid = solutionGrid;
      room.grid = createEmptyGrid();

      return io.emit("showSolutionGrid", room);
    }

    io.emit("readyCheck", user);
  });

  socket.on("startGame", (room) => {
    io.emit("startGame", room);
  });

  socket.on("gameOver", (room) => {
    const currentRoom = rooms.find(
      (currentRoom) => currentRoom.roomId == room.roomId
    );
    let score = 0;
    const gridLength = currentRoom.grid.length;

    console.log(currentRoom);

    for (let i = 0; i < gridLength; i++) {
      if (currentRoom.grid[i].color == currentRoom.solutionGrid[i].color) {
        score++;
      }
    }

    const scoreInPercent = (score / gridLength) * 100;

    socket.emit("gameOver", scoreInPercent);
  });
});

module.exports = { app: app, server: server };
