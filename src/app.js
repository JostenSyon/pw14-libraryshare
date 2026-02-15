import express from "express";
import "dotenv/config";
import session from "express-session";
import authRoutes from "./routes/auth.routes.js";
import { pool } from "./config/db.js";
import booksRouter from "./routes/books.routes.js";
import authorsRouter from "./routes/authors.routes.js";
import publishersRouter from "./routes/publishers.routes.js";
import genresRouter from "./routes/genres.routes.js";
import usersRoutes from "./routes/users.routes.js";
import userBooksRoutes from "./routes/userBooks.routes.js";
import loansRouter from "./routes/loans.routes.js";
import homeRouter from "./routes/home.routes.js";
import adminRouter from "./routes/admin.routes.js";

const app = express();
app.use(express.json());

app.use(session({
  name: "pw14.sid",
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax"
  }
}));

app.use(express.static("public"));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/users", userBooksRoutes);

app.use("/api/books", booksRouter);
app.use("/api/authors", authorsRouter);
app.use("/api/publishers", publishersRouter);
app.use("/api/genres", genresRouter);
app.use("/api/loans", loansRouter);
app.use("/api/home", homeRouter);
app.use("/api/admin", adminRouter);

app.get("/health", async (req, res) => {
  const r = await pool.query("SELECT 1 as ok");
  res.json({ ok: r.rows[0].ok });
});




const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  const addr = server.address();
  if (addr && typeof addr === "object") {
    console.log(`OK: http://localhost:${addr.port}`);
  } else {
    console.log(`OK: port ${port}`);
  }
});

server.on("error", (err) => {
  console.error("Server listen error:", err);
  process.exit(1);
});
