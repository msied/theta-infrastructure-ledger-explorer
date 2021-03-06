var rpc = require('../api/rpc.js');
var Aerospike = require('aerospike')
var accountHelp = require('../helper/account-helper');

//------------------------------------------------------------------------------
//  Global variables
//------------------------------------------------------------------------------
var progressDao = null;
var blockDao = null;
var network_id = 'test_chain_id';
var max_block_per_crawl = 2;
var target_crawl_height;
var txs_count = 0;
var upsertTransactionAsyncList = [];
var validTransactionList = [];
//------------------------------------------------------------------------------
//  All the implementation goes below
//------------------------------------------------------------------------------
exports.Initialize = function (progressDaoInstance, blockDaoInstance, transactionDaoInstance, accountDaoInstance) {
  blockDao = blockDaoInstance;
  progressDao = progressDaoInstance;
  transactionDao = transactionDaoInstance;
  accountDao = accountDaoInstance;
}

exports.Execute = function () {

  rpc.getStatusAsync([]) // read block height from chain
    .then(function (data) {
      // console.log(data);
      var result = JSON.parse(data);
      latest_block_height = result.result.latest_block_height;
      console.log('Latest block height: ' + latest_block_height.toString());
      return progressDao.getProgressAsync(network_id);
    })
    .then(function (progressInfo) {
      var crawled_block_height_progress = progressInfo.height;
      txs_count = progressInfo.count;
      console.log('DB transaction count progress: ' + txs_count.toString());
      console.log('DB block height progress: ' + crawled_block_height_progress.toString());

      if (latest_block_height > crawled_block_height_progress) {
        // get target crawl height
        target_crawl_height = crawled_block_height_progress + max_block_per_crawl;
        if (latest_block_height < target_crawl_height) {
          target_crawl_height = latest_block_height;
        }

        var getBlockAsyncList = []
        for (var i = crawled_block_height_progress + 1; i <= target_crawl_height; i++) {
          console.log('Crawling new block: ' + i.toString());
          getBlockAsyncList.push(rpc.getBlockAsync([{ 'height': i }]))
        }
        return Promise.all(getBlockAsyncList)
      } else {
        console.log('Block crawling is up to date.');
      }
    })
    .then(async function (blockDataList) {
      if (blockDataList) {
        var upsertBlockAsyncList = []
        for (var i = 0; i < blockDataList.length; i++) {
          // Store the block data
          var result = JSON.parse(blockDataList[i]);
          // console.log(blockDataList[i]);
          const blockInfo = {
            height: result.result.block_meta.header.height,
            timestamp: result.result.block_meta.header.time,
            parent_hash: result.result.block_meta.header.last_block_id.hash,
            num_txs: result.result.block_meta.header.num_txs,
            lst_cmt_hash: result.result.block_meta.header.last_commit_hash,
            data_hash: result.result.block_meta.header.data_hash,
            vldatr_hash: result.result.block_meta.header.validators_hash,
            hash: result.result.block_meta.block_id.hash,
            txs: result.result.Txs
          }
          upsertBlockAsyncList.push(blockDao.upsertBlockAsync(blockInfo));
          // Store the transaction data
          var txs = blockInfo.txs;
          if (txs !== undefined && txs.length > 0) {
            for (var j = 0; j < txs.length; j++) {
              const transaction = {
                hash: txs[j].hash,
                type: txs[j].type,
                data: txs[j].data,
                block_height: blockInfo.height,
                timestamp: blockInfo.timestamp
              }
              const isExisted = await transactionDao.checkTransactionAsync(transaction.hash);
              if (!isExisted) {
                transaction.number = ++txs_count;
                validTransactionList.push(transaction);
                upsertTransactionAsyncList.push(transactionDao.upsertTransaction(transaction));
              }
            }
          }
        }
        return Promise.all(upsertBlockAsyncList, upsertTransactionAsyncList)
      }
    })
    .then(() => {
      accountHelp.updateAccount(accountDao, validTransactionList);
    })
    .then(function () {
      validTransactionList = [];
      progressDao.upsertProgressAsync(network_id, target_crawl_height, txs_count);
      console.log('Crawl progress updated to ' + target_crawl_height.toString());
    })
    .catch(function (error) {
      if (error) {
        switch (error.code) {
          case Aerospike.status.AEROSPIKE_ERR_RECORD_NOT_FOUND:
            console.log('Initializng progress record..');
            progressDao.upsertProgressAsync(network_id, 0, 0)
            break;
          default:
            console.log(error);
        }
      }
    });
}