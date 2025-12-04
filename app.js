require('dotenv').config();
const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

let players = ["Теодор", "Николай", "Александър", "Маргарита", "Габриела"];
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

// -- КОНФИГУРАЦИЯ НА ДАННИТЕ --
// Проверяваме дали имаме база данни (в Render) или сме локално
const USE_DB = !!process.env.DATABASE_URL;
const DB_FILE = path.join(__dirname, "database.json");

let pool;
if (USE_DB) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    console.log("⚠️  Работим в локален режим (файл), защото няма връзка с база данни.");
}

// -- ПОМОЩНИ ФУНКЦИИ ЗА ИГРАТА --
function shuffle(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateAssignments(list) {
    let shuffled;
    do {
        shuffled = shuffle(list);
    } while (shuffled.some((p, i) => p === list[i]));

    let result = {};
    list.forEach((p, i) => {
        result[p] = shuffled[i];
    });
    return result;
}

// -- УПРАВЛЕНИЕ НА ДАННИТЕ (ХИБРИДНО) --

// 1. Инициализация
async function initData() {
    if (USE_DB) {
        // Логика за PostgreSQL (Render)
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS santa_game (
                    id INT PRIMARY KEY,
                    data JSONB
                );
            `);
            const res = await client.query('SELECT * FROM santa_game WHERE id = 1');
            if (res.rows.length === 0) {
                const initialData = { assignments: generateAssignments(players), giftLimit: 30 };
                await client.query('INSERT INTO santa_game (id, data) VALUES (1, $1)', [JSON.stringify(initialData)]);
                console.log("✅ Базата данни (Postgres) е инициализирана.");
            } else {
                console.log("✅ Заредени данни от Postgres.");
            }
        } catch (err) {
            console.error("Грешка с DB:", err);
        } finally {
            client.release();
        }
    } else {
        // Логика за файл (Локално)
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { assignments: generateAssignments(players), giftLimit: 30 };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            console.log("✅ Локалният файл database.json е създаден.");
        } else {
            console.log("✅ Заредени данни от database.json");
        }
    }
}

// 2. Взимане на данни
async function getData() {
    if (USE_DB) {
        const res = await pool.query('SELECT data FROM santa_game WHERE id = 1');
        if (res.rows.length > 0) return res.rows[0].data;
    } else {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE));
        }
    }
    return { assignments: {}, giftLimit: 30 };
}

// 3. Записване на данни
async function saveData(data) {
    if (USE_DB) {
        await pool.query('UPDATE santa_game SET data = $1 WHERE id = 1', [JSON.stringify(data)]);
    } else {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    }
}

// Стартираме инициализацията
initData();

let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// -- ROUTES --

app.get("/", async (req, res) => {
    const data = await getData();
    res.render("index", { players, giftLimit: data.giftLimit });
});

app.post("/result", async (req, res) => {
    const name = req.body.name;
    const data = await getData();
    const receiver = data.assignments[name];

    if (!receiver) {
        return res.send("Грешка: Няма разпределение за този човек. Моля, свържете се с админа.");
    }

    try {
        await transporter.sendMail({
            from: "Secret Santa 🎁",
            to: req.body.email,
            subject: `Вашият Secret Santa получател`,
            html: `<h2>Здравей, ${name}!</h2>
                   <p>Ти трябва да подариш на: <b>${receiver}</b></p>
                   <p>Лимит на подаръка: <b>${data.giftLimit} лв</b></p>`
        });
    } catch (e) {
        console.error("Грешка при пращане на имейл:", e);
    }

    res.render("result", { name, receiver, giftLimit: data.giftLimit });
});

app.get("/admin", (req, res) => {
    res.render("admin");
});

app.post("/admin", async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.send("Грешна парола!");

    const newLimit = req.body.limit;
    const newAssignments = generateAssignments(players);

    await saveData({
        assignments: newAssignments,
        giftLimit: newLimit
    });

    res.send(`<h2>Разпределението е обновено!</h2>
              <a href="/">Назад</a>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));