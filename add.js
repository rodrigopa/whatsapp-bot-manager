const Queue = require('bee-queue');
const queue = new Queue('start-process');

const job = queue.createJob({id: 1}).delayUntil((new Date()).setSeconds((new Date()).getSeconds() + 10));
job.save().then((job) => {
   console.log('salvou', job.id);
});


// console.log('teste');
