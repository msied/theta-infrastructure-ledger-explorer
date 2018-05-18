import React from 'react';
import ReactDom from 'react-dom';

import { Router, Route, IndexRoute, browserHistory } from 'react-router';
import Dashboard from './features/dashboard';
import App from './app';
import Transactions from './features/blocks' //TODO: need to change to features/transactions later
import Blocks from './features/blocks'
import './styles.scss';

const app = document.querySelector('#app');

ReactDom.render(
  <Router history={browserHistory}>
    <Route path='/' component={App}>
      {/* <IndexRoute component={NewHome} backendAddress="52.53.243.120:9000"/> */}
      {/* <Route path='*' component={Home} backendAddress="52.53.243.120:9000"/> */}
      <Route path='/dashboard' component={Dashboard} />
      <Route path='/blocks' component={Blocks} backendAddress="52.53.243.120:9000"/>
      <Route path='/txs' component={Transactions} backendAddress="52.53.243.120:9000"/>
    </Route>
  </Router>,
  app
);