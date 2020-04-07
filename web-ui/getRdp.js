const AWS = require('aws-sdk');
const querystring = require('querystring');
process.env.PATH = process.env.PATH + ":/opt/awscli";


exports.lambdaHandler = async(event, context) => {

    console.log(event);

    const passwordData = event.queryStringParameters.passwordData;
    const pem = event.queryStringParameters.pem;
 
    let password ="";

    console.log("Password is", password);

    return {
        "headers": {
            "Content-Type": " text/html"
        },
        "statusCode": 200,
        "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Account Registration - Completed</title>
    </head>
    <body>
       RDP Password: ${password}
    </body>
</html>
        `,
    };


};
