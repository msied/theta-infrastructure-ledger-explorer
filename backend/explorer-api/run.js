var fs = require('fs')
var express = require('express');
var app = express();
var bluebird = require("bluebird");
var asClient = require('../db/aerospike-client.js')
var blockDaoLib = require('../db/block-dao.js');
var progressDaoLib = require('../db/progress-dao.js');
var transactionDaoLib = require('../db/transaction-dao.js');
var accountDaoLib = require('../db/account-dao.js');
var blocksRouter = require("./routes/blocksRouter");
var transactionsRouter = require("./routes/transactionsRouter");
var accountRouter = require("./routes/accountRouter");
var cors = require('cors')
var io;
//------------------------------------------------------------------------------
//  Global variables
//------------------------------------------------------------------------------
var config = null;
var configFileName = 'config.cfg';
var blockDao = null;
var isPushingBlock = false;
var isPushingTxs = false;
//------------------------------------------------------------------------------
//  Start from here
//------------------------------------------------------------------------------

main();

//------------------------------------------------------------------------------
//  All the implementation goes below
//------------------------------------------------------------------------------

function main() {
  console.log('Loading config file: ' + configFileName);
  try {
    config = JSON.parse(fs.readFileSync(configFileName));
  } catch (err) {
    console.log('Error: unable to load ' + configFileName);
    console.log(err);
    process.exit(1);
  }
  console.log(config);

  asClient.init(__dirname, config.aerospike.address, config.aerospike.port, config.aerospike.namespace);
  asClient.connect(function (err) {
    if (err) {
      console.log('Aerospike connection failed');
      process.exit(1);
    } else {
      console.log('Aerospike connection succeeded');
      blockDao = new blockDaoLib(__dirname, asClient);
      bluebird.promisifyAll(blockDao);
      progressDao = new progressDaoLib(__dirname, asClient);
      bluebird.promisifyAll(progressDao);
      transactionDao = new transactionDaoLib(__dirname, asClient);
      bluebird.promisifyAll(transactionDao);
      accountDao = new accountDaoLib(__dirname, asClient);
      bluebird.promisifyAll(accountDao);

      //
      var privateKey = fs.readFileSync(config.cert.key, 'utf8');
      var certificate = fs.readFileSync(config.cert.crt, 'utf8');
      var options = {
        key: privateKey,
        cert: certificate
      };
      app.get('/ping', function (req, res) {
        console.log('Receive healthcheck /ping from ELB - ' + req.connection.remoteAddress);
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': 2
        });
        res.write('OK');
        res.end();
      });
      // start server program
      var server = require('https').createServer(options, app);
      io = require('socket.io')(server);

      io.on('connection', onClientConnect);
      // server.listen(config.server.port);
      server.listen('3030');
      
      app.use(cors());
      
      // app.use(bodyParser.json());
      // app.use(bodyParser.urlencoded({ extended: true }));

      var https = require('https').createServer(options, app);
      https.listen(config.server.port, () => {
        console.log("rest api running on port.", 9000);
      });
      // REST services
      // blocks router
      blocksRouter(app, blockDao, progressDao, config);
      // transactions router       
      transactionsRouter(app, transactionDao, progressDao, config);
      // account router
      accountRouter(app, accountDao, transactionDao, config);
      // keep push block data
      // pushTopBlocks();
    }
  });
}

function onClientConnect(client) {
  console.log('client connected.');
  isPushingBlock = true;
  isPushingTxs = true;
  pushTopBlocks();
  pushTopTransactions();
  // setup client event listeners
  client.on('disconnect', onClientDisconnect);
}

function pushTopBlocks() {
  numberOfBlocks = 10;

  progressDao.getProgressAsync(config.blockchain.network_id)
    .then(function (progressInfo) {
      latest_block_height = progressInfo.height;
      console.log('Latest block height: ' + latest_block_height.toString());

      var query_block_height_max = latest_block_height;
      var query_block_height_min = Math.max(0, query_block_height_max - numberOfBlocks + 1); // pushing 100 blocks initially
      console.log('Querying blocks from' + query_block_height_min.toString() + ' to ' + query_block_height_max.toString())
      //return blockDao.getBlockAsync(123) 
      return blockDao.getBlocksByRangeAsync(query_block_height_min, query_block_height_max)
    })
    .then(function (blockInfoList) {
      io.sockets.emit('event', { type: 'block_list', body: blockInfoList });
    });

  if (isPushingBlock) setTimeout(pushTopBlocks, 1000);
}
function pushTopTransactions() {
  numberOfTransactions = 10;

  progressDao.getProgressAsync(config.blockchain.network_id)
    .then((progressInfo) => {
      latest_transaction_count = progressInfo.count;
      console.log('Latest transaction count: ' + latest_transaction_count.toString());
      var query_txs_count_max = latest_transaction_count;
      var query_txs_count_min = Math.max(0, query_txs_count_max - numberOfTransactions + 1); // pushing 100 blocks initially
      console.log('REST api querying transactions from ' + query_txs_count_min.toString() + ' to ' + query_txs_count_max.toString())
      //return blockDao.getBlockAsync(123) 
      return transactionDao.getTransactionsAsync(query_txs_count_min, query_txs_count_max)
    })
    .then(function (transactionInfoList) {
      io.sockets.emit('event', { type: 'transaction_list', body: transactionInfoList });
    });

  if (isPushingTxs) setTimeout(pushTopTransactions, 1000);
}

function onClientDisconnect() {
  isPushingBlock = false;
  isPushingTxs = false;
  console.log('client disconnect');
}