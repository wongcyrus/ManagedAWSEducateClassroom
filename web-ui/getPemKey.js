const AWS = require('aws-sdk');

exports.lambdaHandler = async(event, context) => {
    console.log(event);

    const KeyMaterial = event.queryStringParameters.KeyMaterial;
    
    return {
        "headers": {
            "Content-Type": " application/x-pem-file"
        },
        "statusCode": 200,
        "body": KeyMaterial
    };
};
