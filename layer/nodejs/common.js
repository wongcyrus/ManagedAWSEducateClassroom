const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const _ = require('lodash');
const axios = require('axios').default;

module.exports.getS3File = async(bucket, key) => {
    const params = {
        Bucket: bucket,
        Key: key
    };
    const response = await s3.getObject(params).promise();
    return response.Body.toString();
};

module.exports.putJsonToS3 = async(bucket, key, json) => {
    const response = s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(json),
        ContentType: "application/json"
    }).promise();
    return response;
};

module.exports.putCsvToS3 = async(bucket, key, csvText) => {
    const response = s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: csvText,
        ContentType: "text/csv"
    }).promise();
    return response;
};

module.exports.putHtmlToS3 = async(bucket, key, html) => {
    const response = s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: html,
        ContentType: "text/html"
    }).promise();
    return response;
};

module.exports.getSnsMessage = async(event) => {
    return JSON.parse((JSON.parse(event.Records[0].body)).Message);
};

module.exports.getSesInboxMessage = async(event) => {
    let message = JSON.parse((JSON.parse(event.Records[0].body)).Message);
    let { inboxBucket, trimedEmailJson } = message;
    const trimedEmailJsonContent = await module.exports.getS3File(inboxBucket, trimedEmailJson);
    const emailBody = JSON.parse(trimedEmailJsonContent).content;
    console.log(message);
    console.log(emailBody);
    return { message, emailBody };
};


module.exports.lsS3Objects = async(bucket, path) => new Promise((resolve, reject) => {
    let prefix = _.trimStart(_.trimEnd(path, '/') + '/', '/');
    let result = { files: [], folders: [] };

    const s3ListCallback = (error, data) => {
        if (error) return reject(error);

        result.files = result.files.concat(_.map(data.Contents, 'Key'));
        result.folders = result.folders.concat(_.map(data.CommonPrefixes, 'Prefix'));

        if (data.IsTruncated) {
            s3.listObjectsV2({
                Bucket: bucket,
                MaxKeys: 2147483647, // Maximum allowed by S3 API
                Delimiter: '/',
                Prefix: prefix,
                ContinuationToken: data.NextContinuationToken
            }, s3ListCallback);
        }
        else {
            resolve(result);
        }
    };

    s3.listObjectsV2({
        Bucket: bucket,
        MaxKeys: 2147483647, // Maximum allowed by S3 API
        Delimiter: '/',
        Prefix: prefix,
        StartAfter: prefix // removes the folder name from the file listing
    }, s3ListCallback);
});

module.exports.getCredentials = async(keyProviderUrl) => {
    try{
        const res = await axios.get(keyProviderUrl);
        console.log(res.data);
        const accessKeyId = res.data.AWS_ACCESS_KEY_ID;
        const secretAccessKey = res.data.AWS_SECRET_ACCESS_KEY;
        const sessionToken = res.data.AWS_SESSION_TOKEN;
    
        return {
            accessKeyId,
            secretAccessKey,
            sessionToken,
            region: "us-east-1"
        };
    }
    catch(e){
        return undefined;
    }
};
