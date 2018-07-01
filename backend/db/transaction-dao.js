var path = require('path');

//------------------------------------------------------------------------------
//  DAO for transaction
//------------------------------------------------------------------------------

module.exports = class TransactionDAO {

  constructor(execDir, client) {
    this.aerospike = require(path.join(execDir, 'node_modules', 'aerospike'));
    this.client = client;
    this.transactionInfoSet = 'transaction';
    this.upsertPolicy = new this.aerospike.WritePolicy({
      exists: this.aerospike.policy.exists.CREATE_OR_REPLACE
    });
  }

  upsertTransaction(transactionInfo, callback) {
    let bins = {
      'hash': transactionInfo.hash.toUpperCase(),
      'type': transactionInfo.type,
      'data': transactionInfo.data,
      'number': transactionInfo.number,
      'block_height': transactionInfo.block_height,
      'timestamp': transactionInfo.timestamp
    }
    this.client.put(this.transactionInfoSet, bins.hash, bins, {}, this.upsertPolicy, callback);
  }
  checkTransaction(pk, callback) {
    return this.client.exists(this.transactionInfoSet, pk, (err, res) => {
      callback(err, res)
    })
  }
  getTransactions(min, max, callback) {
    // var filter = (min !== null && max !== null) ? this.aerospike.filter.range('uuid', min, max) : null;
    var filter = this.aerospike.filter.range('number', min, max);
    this.client.query(this.transactionInfoSet, filter, (error, recordList) => {
      var transactionInfoList = []
      for (var i = 0; i < recordList.length; i++) {
        var transactionInfo = {};
        transactionInfo.hash = recordList[i].bins.hash;
        transactionInfo.type = recordList[i].bins.type;
        transactionInfo.data = recordList[i].bins.data;
        transactionInfo.number = recordList[i].bins.number;
        transactionInfo.block_height = recordList[i].bins.block_height;
        transactionInfo.timestamp = transactionInfo.timestamp;
        transactionInfoList.push(transactionInfo)
      }
      callback(error, transactionInfoList)
    });
  }

  getTransactionByPk(pk, callback) {
    this.client.get(this.transactionInfoSet, pk.toUpperCase(), (error, record) => {
      if (error) {
        switch (error.code) {
          // Code 2 means AS_PROTO_RESULT_FAIL_NOTFOUND
          // No record is found with the specified namespace/set/key combination.
          case 2:
            console.log('NOT_FOUND -', pk)
            callback(error);
            break
          default:
            console.log('ERR - ', error)
        }
      } else {
        const transactionInfo = normalizeTransactionRecord(record);
        callback(error, transactionInfo);
      }
    });
  }
  getTransactionsByPkArr(pkArr, callback) {
    this.client.batchGet(this.transactionInfoSet, pkArr, (error, records) => {
      if (error) {
        switch (error.code) {
          // Code 2 means AS_PROTO_RESULT_FAIL_NOTFOUND
          // No record is found with the specified namespace/set/key combination.
          case 2:
            console.log('NOT_FOUND -', pkArr.join(', '))
            callback(error);
            break
          default:
            console.log('ERR - ', error)
        }
      } else {
        const transactions = records.map(result => {
          const transactionInfo = normalizeTransactionRecord(result.record);
          return transactionInfo;
        })
        callback(error, transactions)
      }
    });
  }
}

function normalizeTransactionRecord(record) {
  const transactionInfo = {};
  transactionInfo.hash = record.bins.hash;
  transactionInfo.type = record.bins.type;
  transactionInfo.data = record.bins.data;
  transactionInfo.number = record.bins.number;
  transactionInfo.block_height = record.bins.block_height;
  transactionInfo.timestamp = record.bins.timestamp;
  return transactionInfo;
}