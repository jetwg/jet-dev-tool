/**
 * @file http
 * @author sekiyika (px.pengxing@gmail.com)
 */

'use strict';
const fetch = require('node-fetch');
// const FormData = require('form-data');
const qs = require('qs');

function request(opt) {

    let headers = Object.assign({}, {
    }, opt.headers || {});

    opt = Object.assign({
        url: '',
        query: {},
        method: 'GET',
        dataType: 'json',
        credentials: 'cors'
    }, opt);
    opt.headers = headers;

    if (!opt.url) {
        throw new Error('url is required');
    }

    let querystr = qs.stringify(opt.query);
    let url = opt.url + '?' + querystr;

    delete opt.query;
    delete opt.url;
    return fetch(url, opt).then(function (response) {
        if (opt.dataType === 'json') {
            return response.json();
        }
        else if (opt.dataType === 'text') {
            return response.text();
        }
        if (opt.dataType === 'raw') {
            return response;
        }
    });
}

module.exports = {
    get(conf) {
        let opt = Object.assign({}, conf);
        opt.method = 'GET';
        return request(opt);
    },
    post(conf) {
        let opt = Object.assign({}, conf);
        opt.method = 'POST';
        opt.headers = opt.headers || {};
        opt.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        if (opt.body) {
            opt.body = qs.stringify(opt.body);
            // if (opt.bodyType === 'string') {
            //
            // }
            // else {
            //     let data = new FormData();
            //     for (let key of Object.keys(opt.body)) {
            //         data.append(key, opt.body[key]);
            //     }
            //     opt.body = data;
            // }
        }

        return request(opt);
    }
};
