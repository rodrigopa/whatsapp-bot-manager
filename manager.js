const pm2 = require('pm2');
const Queue = require('bee-queue');
const queue = new Queue('bot-process');

queue.process((job, done) => {
    console.log(`Process job: ${job.id} iwth data:`, job.data);
    switch (job.data.type) {
        case 'start':
            pm2.connect(function(err, proc) {
                if (err) {
                    console.error(err);
                    return done(null, false);
                }

                pm2.start({
                    script: `bot.js`,
                    name: `bot-${job.data.id}`,
                    args: [job.data.id],
                    force: true,
                    kill_retry_time: 3000,
                    kill_timeout: 6000
                }, (err, proc) => {
                    if (err) {
                        console.error(err);
                        pm2.disconnect();
                        return done(null, false);
                    }

                    pm2.disconnect();
                    return done(null, true);
                });
            });
            break;
        case 'stop':
            pm2.connect(err => {
                if (err) {
                    return done(null, false);
                }

                pm2.stop(`bot-${job.data.id}`, (err) => {
                    if (err) {
                        return done(null, false);
                    }

                    pm2.disconnect()
                    return done(null, true);
                });
            });
            break;
        default:
            return done(null, false);
    }
});
