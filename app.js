const createError = require('http-errors');
const express = require('express');
require('dotenv').config()
const path = require('path');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser')
const fileUpload = require('express-fileupload')
const logger = require('morgan');
const flash = require('connect-flash')
const passport = require('passport')
const hbs = require('express-handlebars')
const db = require('./configs/connection')
const session = require('express-session')
const hbsHelper = require('./helpers/hbsHelper')

//log create
require('simple-node-logger').createSimpleFileLogger('project.log');

require('./configs/passport')(passport);

var userRouter = require('./routes/user');
var adminRouter = require('./routes/admin');

var app = express();

db.connect((err) => {
    if (err) console.log("DataBase Connection Error" + err);
    else {
        console.log("DataBase Connected");
        //require('./config/dbAutoConf').init()
    }
}, { useUnifiedTopology: true })

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.engine('hbs',
    hbs({
        layoutDir: __dirname + '/views/layouts/',
        defaultLayout: 'layout',
        partialsDir: __dirname + '/views/partials/',
        extname: 'hbs',
        helpers: hbsHelper
    })
)
app.use(express.static(path.join(__dirname, 'public')));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(fileUpload())
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true,
    maxAge: 3600000
}))

app.use(passport.initialize());
app.use(passport.session());

// Connect flash
app.use(flash());


// Global variables
app.use(function (req, res, next) {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.org = process.env.org
    if (req.user) {
        if (req.user.type === 'user')
            res.locals.user = req.user
        else if (req.user.type === 'admin')
            res.locals.admin = req.user
    }
    next();
});

app.use('/', userRouter);
app.use('/admin', adminRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;