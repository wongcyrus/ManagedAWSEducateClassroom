const AWS = require('aws-sdk');

exports.lambdaHandler = async(event, context) => {
    const rdpTemplate=`
auto connect:i:1
full address:s:###PublicDNS###
username:s:Administrator
`;
    console.log(event);

    const publicDNS = event.queryStringParameters.PublicDNS;
    const rdpFile = rdpTemplate.replace("###PublicDNS###",publicDNS);
    return {
        "headers": {
            "Content-Type": " application/x-rdp"
        },
        "statusCode": 200,
        "body": rdpFile
    };
};
