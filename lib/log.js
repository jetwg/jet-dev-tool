/**
 * @file log
 * @author kaivean
 */

const chalk = require('chalk');

function print(args, level, addColor) {
    for (let arg of args) {
        if (typeof arg === 'string') {
            console[level](addColor(arg));
        }
        else {
            console[level](arg);
        }
    }
}

module.exports = {
    error(...args) {
        print(args, 'error', chalk.red);
    },
    info(...args) {
        print(args, 'info', chalk.green);
    },
    warn(...args) {
        print(args, 'warn', chalk.yellow);
    }
};
