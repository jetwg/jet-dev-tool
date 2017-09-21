/**
 * @file 工具包
 * @author kaivean
 */

const fs = require('fs');
const path = require('path');

/**
 * 获取sdk的工作路径
 *
 * @return {string} sdk的工作路径
 */
exports.getSDKHome = function () {
    let dir = process.env[
        require('os').platform() === 'win32'
            ? 'APPDATA'
            : 'HOME'
        ] + require('path').sep + '.edpx-wise';

    // 如果这个目录不存在，则创建这个目录
    !fs.existsSync(dir) && fs.mkdirSync(dir);
    return dir;
};

/**
 * js执行系统命令
 *
 * @param  {string} handler  命令名
 * @param  {Array}args     命令参数
 * @param  {Object} renderConf 配置
 * @param  {Object} gConf      全局配置
 * @return {Object<Promise>} promise对象
 */
exports.execCommands = function (handler, args) {
    args = args || {};
    let child = require('child_process').spawn(
        handler,
        args
    );
    let stdout = [];
    let stderror = '';
    return new Promise(function (resolve, reject) {
        child.stderr.on('data',
            function (buf) {
                stderror = buf.toString().trim();
                // resolve({
                //     code: 1,
                //     output: [].slice.call(arguments).join('\n'),
                //     stdOut: bodyBuffer.join('')
                // });
            }
        );

        child.stdout.on('data',
            function (buf) {
                // console.log('stdout', buf.toString());
                let str = buf.toString().trim();
                str && stdout.push(str);
            }
        );

        child.on('close',
            function (code) {
                if (stderror.trim().length) {
                    return resolve({
                        code: 1,
                        stderror: stderror,
                        stdout: stdout.join('')
                    });
                }
                resolve({
                    code: code,
                    stderror: stderror,
                    stdout: stdout.join('')
                });
            }
        );
    });
};

exports.getIPAdress = function () {
    let interfaces = require('os').networkInterfaces();
    for (let devName in interfaces) {
        if (interfaces.hasOwnProperty(devName)) {
            let iface = interfaces[devName];
            for (let i = 0, len = iface.length; i < len; i++) {
                let alias = iface[i];
                if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                    return alias.address;
                }
            }
        }
    }
};

function ip2long(ipAddress) {
    let output = 0;
    if (ipAddress.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
        let parts = ipAddress.split('.');
        output = (parts [0] * Math.pow(256, 3))
            + (parts [1] * Math.pow(256, 2))
            + (parts [2] * Math.pow(256, 1))
            + (parts [3] * Math.pow(256, 0));
    }
    return output << 0;
}


function isInBaiduNetwork() {

    let ipRange = [
        ['10.0.0.0', '10.255.255.255', 24],
        ['172.16.0.0', '172.31.255.255', 20],
        // ['192.168.0.0', '192.168.255.255', 16],
        ['169.254.0.0', '169.254.255.255', 16]
        // ['127.0.0.0', '127.255.255.255', 24]
    ];
    let ip = getIPAdress();

    for (let i = 0, len = ipRange.length; i < len; i++) {
        let pr = ipRange[i];
        if ((ip2long(ip) & (0xFFFFFFFF << pr[2])) === ip2long(pr[0])) {
            return true;
        }
    }

    return false;
}

exports.getAlarcPath = function () {
    return path.join(
        process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'],
        '.alarc'
    );
};

// 缓存起来
let alarc;
exports.getAlarc = function (name) {
    if (!alarc) {
        try {
            alarc = JSON.parse(fs.readFileSync(this.getAlarcPath(), 'utf-8'));
        }
        catch (e) {
            alarc = {};
        }
    }

    return name ? alarc[name] : alarc;
};

exports.setAlarc = function (name, val) {
    let conf = this.getAlarc() || {};
    conf[name] = val;
    try {
        fs.writeFileSync(
            this.getAlarcPath(),
            JSON.stringify(conf, 0, 4),
            'utf-8'
        );
    }
    catch (e) {
        return false;
    }
    return true;
};

exports.isInBaiduNetwork = isInBaiduNetwork;
