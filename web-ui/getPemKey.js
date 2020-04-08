const AWS = require('aws-sdk');
const endOfLine = require('os').EOL;

exports.lambdaHandler = async(event, context) => {
    console.log(event);
    const KeyMaterial = event.queryStringParameters.KeyMaterial;
    return {
        "headers": {
            "Content-Type": "application/x-pem-file"
        },
        "statusCode": 200,
        "body": decodeURIComponent(KeyMaterial)
    };
};
