var http = require('http');
var path = require('path');
var fs = require('fs');

var connect = require('connect');

var sql = require('mssql');

var serveStatic = require('serve-static');
var mapClient = require('@google/maps');
var freegeoip = require('node-freegeoip');
var moment = require('moment');
var NodeSession = require('node-session');
var formidable = require('formidable');

// initialize session
var session = new NodeSession({
    'secret': 'kW3NbfTUeK9DFQGyQSfTt5oG0z6NgdYM',
    'expireOnClose': true
});

// read configuration file
var configPath = path.join(__dirname, 'config.json');

var dbConfig = {
    server: "localhost",
    user: "",
    password: "",
    database: ""
};
var port = 8888;

if (fs.existsSync(configPath)) {
    var configObj = JSON.parse(fs.readFileSync(configPath));
    if (configObj["database"] !== undefined)
        dbConfig = configObj["database"];
    if (configObj["port"] !== undefined)
        port = configObj["port"];
}

// connect to the database
var sqlCon = new sql.Connection(dbConfig, function (err) {
    if (err) console.log(err);
});


var app = connect();

var server = http.createServer(app);

var io = require('socket.io')(server); // sockets

// serve static files (javascript, css)
app.use(serveStatic(path.join(__dirname, 'public')));

app.use('/', function (req, res, next) { // home page
    if (req.url === '/') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(fs.readFileSync(path.join(__dirname, 'views/index.html')));
        res.end();
    } else if (req.url === '/favicon.ico') {
        res.writeHead(404);
        res.end();
    } else next();
});

app.use('/login', function (req, res, next) { // process the login form
    session.startSession(req, res, function () {
        var redirectToAdmin = function () {
            res.writeHead(302, {'Location': '/admin'});
            res.end();
        };

        if (req.method.toUpperCase() === 'POST') {

            var loginForm = new formidable.IncomingForm();

            loginForm.parse(req, function (err, fields, files) {
                if (fields['username'] === undefined || fields['password'] === undefined) {
                    req.session.put('badLogin', true);
                    redirectToAdmin();
                    return;
                }
                var ps = new sql.PreparedStatement(sqlCon);
                ps.input('u', sql.VarChar);
                ps.input('p', sql.VarChar);
                var query = 'SELECT * FROM users WHERE username=@u AND password=@p';
                ps.prepare(query, function (err) {
                    if (err) console.log(err);
                    else {
                        ps.execute({
                            'u': fields['username'],
                            'p': fields['password']
                        }, function (err, results) {
                            req.session.put('isLoggedIn', results.length > 0);
                            req.session.put('badLogin', results.length === 0);
                            redirectToAdmin();
                            ps.unprepare();
                        });
                    }
                });
            });
        } else {
            redirectToAdmin();
        }
    });
});

app.use('/logout', function (req, res, next) {
    session.startSession(req, res, function () {
        req.session.flush();
        res.writeHead(302, {"Location": "/"});
        res.end();
    });
});

app.use('/admin', function (req, res, next) { // shows admin page if user is logged in, otherwise shows the login page
    session.startSession(req, res, function () {
        var loadLoginPage = function (badLogin) {
            res.writeHead(200, {"Content-Type": "text/html"});
            if (badLogin) {
                res.write(fs.readFileSync(path.join(__dirname, 'views/admin_bad_login.html')));
            } else {
                res.write(fs.readFileSync(path.join(__dirname, 'views/admin_login.html')));
            }
            req.session.forget('badLogin');
            res.end();
        };

        var loadAdminPage = function () {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.write(fs.readFileSync(path.join(__dirname, 'views/admin.html')));
            res.end();
        };

        if (req.session.has('isLoggedIn')) {
            if (req.session.get('isLoggedIn', false)) loadAdminPage(); // user is logged in
            else {
                loadLoginPage(req.session.get('badLogin', false)); // user not logged in
            }
        } else {
            req.session.put('isLoggedIn', false);
            loadLoginPage(false); // user not logged in
        }
    });
});


app.use('/newLocation', function (req, res, next) { // a user visited the webpage
    if (req.method === 'POST') {
        // read POST data in chunks and parse it into an object
        var rawData = "";

        req.on('data', function (data) {
            rawData += data;
        });
        req.on('end', function () {
            var locationData = JSON.parse(rawData);
            var pos;
            var address = req.connection.remoteAddress;

            // function to insert into database
            var insertLocation = function (pos) {
                var dateAccessed = moment().format('YYYY-MM-DD HH:mm:ss');
                var ps = new sql.PreparedStatement(sqlCon);
                ps.input('ip', sql.VarChar);
                ps.input('date', sql.VarChar);
                ps.input('lat', sql.Float);
                ps.input('lng', sql.Float);
                var query = "INSERT INTO visits (ip_address, date_accessed, latitude, longitude) VALUES (@ip, @date, @lat, @lng)";
                ps.prepare(query, function (err) {
                    ps.execute({
                        'ip': address,
                        'date': dateAccessed,
                        'lat': pos['lat'],
                        'lng': pos['lng']
                    }, function (err, result) {
                        io.emit('visit', {"pos": pos});
                        ps.unprepare(function (err) {
                        });
                    });
                });
            };

            if (locationData['pos'] === undefined) { // user did NOT provide their location
                freegeoip.getLocation(address, function (location) { // so we request it from a 3rd party geolocator
                    pos = {'lat': location['latitude'], 'lng': location['longitude']};
                    insertLocation(pos);
                });
            } else {
                insertLocation(locationData['pos']); // user provided their location
            }
        });
        res.writeHead(204); // 204 - success, but not returning any data
        res.end();
    } else {
        res.writeHead(405); // 405 - request not using POST
        res.end();
    }

});

app.use('/recentData', function (req, res, next) {
    session.startSession(req, res, function () {
        // ensure user is logged in
        if (!req.session.get('isLoggedIn', false)) {
            res.writeHead(302, {'Location': '/admin'});
            res.end();
            return;
        }
        var sqlRequest = new sql.Request(sqlCon);

        // select data from last 5 minutes
        var q = "SELECT * FROM visits WHERE DATEADD(mm,5,date_accessed) > GETDATE()";

        sqlRequest.query(q, function (error, records) {
            if (error) {
                res.writeHead(500);
                console.log(error);
            } else {
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.write(JSON.stringify(records));
            }
            res.end();
        });
    })
});


server.listen(port, '127.0.0.1');