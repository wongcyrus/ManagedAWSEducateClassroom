const AWS = require('aws-sdk');
const s3 = new AWS.S3();


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
        }
    ).promise();
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
