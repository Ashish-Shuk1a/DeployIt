require('dotenv').config()
const {exec} = require('child_process')
const path = require('path')
const fs = require('fs')
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const redis = require('ioredis')

const publisher = new redis(`rediss://default:${process.env.AIVEN_KEY}@caching-23b0ae83-deployit.h.aivencloud.com:17507`)

function publishLog(log){
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify(log))
}

const s3Client = new S3Client({
    region:'ap-south-1',
    credentials:{
        accessKeyId: process.env.ACCESS_ID,
        secretAccessKey: process.env.SECRET_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID

async function init(){
    console.log('Executing script.js');
    publishLog("Build Started")
    console.log('Build Started')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data',function(data){
        console.log(data.toString())
        publishLog(data.toString())
    })

    p.stdout.on('error',function(data){
        console.log('Error ',data.toString())
        publishLog(`Error: ${data.toString()}`)
    })    

    p.on('close',async function(){

        console.log('Build Complete')
        publishLog('Build Complete')
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

        publishLog('Uploading files')
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;

            console.log('uploading', filePath)
            publishLog(`Uploading ${file}`)

            const command = new PutObjectCommand({
                Bucket: 'deployit-storage',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })

        
            try {
                await s3Client.send(command);
                console.log('uploaded', filePath);
                publishLog(`Uploaded ${file}`)
            } catch (error) {
                console.error('Error uploading', filePath, error);
            }
        }
        publishLog('Done...')
        console.log('Done...')
    })
}

init()