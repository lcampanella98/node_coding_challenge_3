var http = require('http');
var connect = require('connect');
var io = require('socket.io');
//var serveStatic = require('serve-static');
var path = require('path');
var sql = require('mssql');
var mapClient = require('@google/maps');
var fs = require('fs');
//var Address6 = require('ip-address').Address6;

var app = connect();

var configPath = path.join(__dirname, 'config.json');
var dbConfig;
if (fs.existsSync(configPath)) {
    var configObj = JSON.parse(fs.readFileSync(configPath));
    if (configObj["database"] !== undefined) dbConfig = configObj["database"];
    else {
        dbConfig = {
            server: "localhost",
            user: "",
            password: "",
            database: ""
        }
    }
/*    dbConfig = {
        server: confObj["server"],
        user: confObj["user"],
        password: confObj["password"],
        database: confObj["database"]
    }*/
} else {
    dbConfig = {
        server: "localhost",
        user: "",
        password: "",
        database: ""
    }
}
var sqlCon = new sql.Connection(dbConfig, function(err) {
    if (err)
        console.log(err);
});

app.use('/admin', function(req, res, next) {
    console.log('admin page');
});

app.use('/data', function(req, res, next) {
    var sqlRequest = new sql.Request(sqlCon);
    sqlRequest.query("SELECT * FROM logins", function(error, records) {
        if(error) {
            res.writeHead(500);
        } else {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.write(JSON.stringify(records));
        }
        res.end();
    });

});

app.use('/', function(req, res, next) {
    if (req.url !== '/favicon.ico') {
        var address = req.connection.remoteAddress;



        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(fs.readFileSync(path.join(__dirname, 'public/index.html')));
        res.end();
    }
});

http.createServer(app).listen(8888, '127.0.0.1');