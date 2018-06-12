var path = require('path');

//------------------------------------------------------------------------------
//  DAO for transaction
//------------------------------------------------------------------------------

module.exports = class AccountDAO {

  constructor(execDir, client) {
    this.aerospike = require(path.join(execDir, 'node_modules', 'aerospike'));
    this.client = client;
    this.accountInfoSet = 'account';
    this.upsertPolicy = new this.aerospike.WritePolicy({
      exists: this.aerospike.policy.exists.CREATE_OR_REPLACE
    });
  }

  upsertAccount(accountInfo, callback) {
    let bins = {
      'address': accountInfo.address,
      'balance': accountInfo.balance
    }
    this.client.put(this.accountInfoSet, bins.address, bins, {}, this.upsertPolicy, callback);
  }
  checkAccount(pk, callback){
    return this.client.exists(this.accountInfoSet, pk, (err, res) => {
      callback(err, res)
    })
  }

  getAccountByPk(pk, callback) {
    this.client.get(this.accountInfoSet, pk, function (error, record) {
      if (error) {
        switch (error.code) {
          // Code 2 means AS_PROTO_RESULT_FAIL_NOTFOUND
          // No record is found with the specified namespace/set/key combination.
          case 2:
            console.log('NOT_FOUND -', pk)
            callback(error);
            break
          default:
            console.log('ERR - ', error, pk)
        }
      } else {
        var accountInfo = {};
        accountInfo.address = record.bins.address;
        accountInfo.balance = record.bins.balance;
        callback(error, accountInfo);
      }
    });
  }

}