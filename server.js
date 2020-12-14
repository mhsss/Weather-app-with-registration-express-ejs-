const express = require('express')
const session = require('express-session')
const passport = require('passport')
const bcrypt = require('bcrypt')
const request = require('request-promise')
const bodyParser = require('body-parser')
const flash = require('express-flash')
const { pool } = require('./dbConfig')
const app = express()


const initializePassport = require('./passportConfig')

initializePassport(passport)

const PORT = process.env.PORT || 4000

app.set("view engine", "ejs")
app.use(express.static('css'))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.urlencoded({ extended: false }))
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())

app.use(flash())

app.get("/", (req, res) => {
    res.render("index")
})

app.get("/users/register", checkAuthenticated, (req, res) => {
    res.render("register");
})

app.get("/users/login", checkAuthenticated, (req, res) => {
    res.render("login")
})

app.get("/users/main", checkNotAuthenticated, (req, res) => {
    let weather = null
    let text = ''
    res.render("main", { user: req.user.name, weather, text })
})

let cityName = ''

app.post('/users/main', (req, res) => {
    cityName = req.body.city_name
    const url = `http://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=f50574e197fe22a60e438ae9d8f29cd8`


    if (req.body.city_name === '') {
        return null
    } else {

        const url = `http://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=f50574e197fe22a60e438ae9d8f29cd8`

        request(url, (error, response, body) => {
            if (error) {
                throw error
            }

            let text = ''
            let weather = null
            const weather_json = JSON.parse(body)

            if (weather_json.cod === '404') {
                text = weather_json.message
                weather = null

            } else {
                text = ''
                weather = {
                    city: cityName,
                    temp: Math.round(weather_json.main.temp - 273),
                    descr: weather_json.weather[0].description,
                    icon: weather_json.weather[0].icon
                }
            }
            res.render("main", { weather: weather, text: text })
        })
    }
})

app.get('/addtofav', (req, res) => {

    pool.query(
        `SELECT * FROM fav`,
        (err, result) => {
            if (err) {
                throw err
            }
            if (result.rows.find(row => row.name === cityName)) {
                return null
            }
            pool.query(
                `INSERT INTO fav (name) 
        VALUES ($1) 
        RETURNING id`, [cityName],
                (err, result) => {
                    if (err) {
                        throw err
                    }
                   res.redirect('/fav')
                }
            )

        }
    )
})

app.get('/fav', (req, res) => {

    pool.query(
        `SELECT * FROM fav`,
        (err, result) => {
            if (err) {
                throw err
            }

            const wrap = async () => {
                let cityArr = []
                for (let city of result.rows) {
                    let url = `http://api.openweathermap.org/data/2.5/weather?q=${city.name}&appid=f50574e197fe22a60e438ae9d8f29cd8`

                    const response = await request(url, (error, response, body) => {
                        if (error) {
                            throw error
                        }

                        const cityWeather = JSON.parse(body)

                        let weather = {
                            city: cityWeather.name,
                            temp: Math.round(cityWeather.main.temp - 273),
                            descr: cityWeather.weather[0].description,
                            icon: cityWeather.weather[0].icon
                        }
                        cityArr.push(weather)
                    })
                }
                return cityArr
            }
            wrap().then(cities => res.render("fav", { cities }))
        }
    )
})

app.get('/city/:city?', (req, res) => {

    const cityName = req.params.city

    let url = `http://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=f50574e197fe22a60e438ae9d8f29cd8`

    const wrap = async () => {

        const cityArr = []

        await request(url, async (error, res, body) => {
            if (error) {
                throw error
            }

            const response = JSON.parse(body)

            const city = {
                coord: response.coord,
                sky: response.weather[0].main,
                skyDescr: response.weather[0].description,
                icon: response.weather[0].icon,
                temp: Math.round(response.main.temp - 273),
                feelsLike: Math.round(response.main.feels_like - 273),
                humidity: response.main.humidity,
                wind: response.wind.speed,
                name: response.name,
                sunrise: response.sys.sunrise,
                sunset: response.sys.sunset

            }

            for (let i = 0; i < 5; i++) {
                cityArr.push(city)
            }
        })

        return cityArr
    }

    wrap().then(cityArr => res.render('city', { cityArr }))

}
)

app.get('/users/logout', (req, res) => {
    req.logOut()
    req.flash('success_msg', 'you logged out')
    res.redirect('/users/login')
})

app.post('/users/register', async (req, res) => {
    const { name, email, password, password2 } = req.body

    let errors = []

    if (!name || !email || !password || !password2) {
        errors.push({ message: 'please enter all filds' })
    }
    if (name.length < 2) {
        errors.push({ message: 'name must be more than 2 symbols' })
    }
    if (name.length > 32) {
        errors.push({ message: 'name must be less than 32 symbols' })
    }
    if (password.length < 2) {
        errors.push({ message: 'password must be more than 2 symbols' })
    }
    if (password.length > 16) {
        errors.push({ message: 'password must be less than 16 symbols' })
    }
    if (password != password2) {
        errors.push({ message: 'passwords do not equal' })
    }
    if (errors.length > 0) {
        res.render('register', { errors })
    }
    else {

        let hashedPassword = await bcrypt.hash(password, 10)

        pool.query(`SELECT * FROM users WHERE email = $1`,
            [email], (err, result) => {
                if (err) {
                    throw err
                }
                if (result.rows.length > 0) {
                    errors.push({ message: 'this email already exist' })
                    res.render('register', { errors })
                } else {
                    pool.query(
                        `INSERT INTO users (name, email, password) 
                        VALUES ($1, $2, $3) 
                        RETURNING id, password`,
                        [name, email, hashedPassword],
                        (err, result) => {
                            if (err) {
                                throw err
                            }
                            req.flash('success_msg', 'You are now registred.Please login')
                            res.redirect('/users/login')
                        }

                    )
                }
            })
    }
})

app.post('/users/login', passport.authenticate('local', {
    successRedirect: '/users/main',
    failureRedirect: '/users/login',
    failureFlash: true
}))

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/users/main')
    }
    next()
}

function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }

    res.redirect('/users/login')
}

app.listen(PORT, () => {
    console.log('listening')
})