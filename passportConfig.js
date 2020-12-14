const localStrategy = require('passport-local').Strategy
const { authenticate } = require('passport')
const { pool } = require('./dbConfig')
const bcrypt = require('bcrypt')


function initialize(passport) {

    const authenticateUser = (email, password, done) => {

        pool.query(
            `SELECT * FROM users WHERE email = $1`,
            [email], (err, result) => {
                if (err) {
                    throw err
                }

                if (result.rows.length > 0) {
                    const user = result.rows[0]

                    bcrypt.compare(password, user.password, (err, isMatch) => {
                        if (err) {
                            throw err
                        }


                        if (isMatch) {

                            return done(null, user)
                        }
                        else {
                            return done(null, false, { message: 'password isnt correct' })
                        }
                    })
                }

                else {
                    return done(null, false, { message: 'email is not registred' })
                }

            }
        )

    }

    passport.use(new localStrategy({
        usernameField: 'email',
        passwordField: 'password'
    },
        authenticateUser
    ))
    passport.serializeUser((user, done) => {
        done(null, user.id)
    })
    passport.deserializeUser((id, done) => {
        pool.query(
            `SELECT * FROM users WHERE id = $1`, [id], (err, result) => {
                if (err) {
                    throw err
                }
                return done(null, result.rows[0])
            }
        )
    })
}

module.exports = initialize