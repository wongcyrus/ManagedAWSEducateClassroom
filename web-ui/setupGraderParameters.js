const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const querystring = require('querystring');
const axios = require('axios');
const recaptchaSiteKey = process.env.RecaptchaSiteKey;
const recaptchaSercetKey = process.env.RecaptchaSercetKey;
const graderParameterTable = process.env.GraderParameterTable;


const encodedStr = rawStr => rawStr.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
    return '&#' + i.charCodeAt(0) + ';';
});

exports.lambdaHandler = async(event, context) => {

    console.log(event);
    if (event.requestContext.http.method === "GET") {
        if (!event.queryStringParameters || !event.queryStringParameters.classroomName) {
            return {
                "headers": {
                    "Content-Type": " text/html"
                },
                "statusCode": 200,
                "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Account Registration - Error</title>
    </head>
    <body>
        <h2>Invalid Url and it must have classroomName.</h2>
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `
            };
        }
        else {
            let classroomName = encodedStr(event.queryStringParameters.classroomName);
            let gradeFunction = encodedStr(event.queryStringParameters.gradeFunction);
            let studentEmail = "";
            if (event.queryStringParameters.studentEmail)
                studentEmail = event.queryStringParameters.studentEmail.toLowerCase();
            let recaptcha = '<input type="submit" value="Submit">';
            if (recaptchaSiteKey !== "") {
                recaptcha = `
<script>
   function onSubmit(token) {
     document.getElementById("keyform").submit();
   }
    grecaptcha.ready(function() {
    // do request for recaptcha token
    // response is promise with passed token
        grecaptcha.execute('${recaptchaSiteKey}', {action:'validate_captcha'})
                  .then(function(token) {
            // add token value to form
            document.getElementById('g-recaptcha-response').value = token;
        });
    });   
</script>
<button class="g-recaptcha" 
        data-sitekey="${recaptchaSiteKey}" 
        data-callback='onSubmit' 
        data-action='submit'>Submit</button>
`;
            }

            return {
                "headers": {
                    "Content-Type": " text/html"
                },
                "statusCode": 200,
                "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Student Account Registration</title>
        <script src="https://www.google.com/recaptcha/api.js?render=${recaptchaSiteKey}"></script>
        <meta charset="utf-8"/>
    </head>
    <body>
        <h2>Managed AWS Educate Classroom Setup Grader Parameters - ${classroomName}:${gradeFunction}</h2>
        <form id="keyform" method="POST">
            <input type="hidden" id="g-recaptcha-response" name="g-recaptcha-response">
            <input type="hidden" name="action" value="validate_captcha">
            <input type="hidden" id="classroomName" name="classroomName" value="${classroomName}">
            <input type="hidden" id="gradeFunction" name="gradeFunction" value="${gradeFunction}">
            <label for="Email">Email:</label><br>
            <input type="email" id="email" name="email" size="50" value="${studentEmail}" required><br>
            <label for="gradeFunctionParameters">Parameter json:</label><br>
            <textarea id="gradeFunctionParameters" name="gradeFunctionParameters" rows="20" cols="100" required></textarea><br>
            ${recaptcha}
        </form> 
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `,
            };
        }
    }
    else if (event.requestContext.http.method === "POST" && event.isBase64Encoded) {
        const buff = Buffer.from(event.body, 'base64');
        const body = buff.toString('ascii');
        const parameters = querystring.parse(body);
        console.log(parameters);
        if (recaptchaSercetKey !== "") {
            const token = parameters["g-recaptcha-response"][0];
            let verifyResult = await axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSercetKey}&response=${token}`);

            console.log(verifyResult);
            if (verifyResult.status !== 200 || !verifyResult.data.success) {
                return {
                    "headers": {
                        "Content-Type": "text/html"
                    },
                    "statusCode": 200,
                    "body": "recaptcha error!",
                };
            }
        }

        const IsJsonString = (str) => {
            try {
                JSON.parse(str);
            }
            catch (e) {
                return false;
            }
            return true;
        };

        if (!IsJsonString(parameters.gradeFunctionParameters)) {
            return {
                "headers": {
                    "Content-Type": "text/html"
                },
                "statusCode": 200,
                "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Setup Grader Parameters - Error</title>
    </head>
    <body>
        <h2>Managed AWS Educate Classroom Setup Grader Parameters - Error</h2>
        <h1>Invalid JSON</h1>
        ${parameters.classroomName + "#" + parameters.gradeFunction + "#" + parameters.email}<br/>
        ${parameters.gradeFunctionParameters}
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `,
            };
        }

        let result = await dynamo.put({
            "TableName": graderParameterTable,
            "Item": {
                "id": parameters.classroomName + "#" + parameters.gradeFunction + "#" + parameters.email,
                "parameters": parameters.gradeFunctionParameters
            }
        }).promise();
        console.log(result);

        return {
            "headers": {
                "Content-Type": "text/html"
            },
            "statusCode": 200,
            "body": `
<!DOCTYPE html>
<html>
    <head>
      <title>Managed AWS Educate Classroom Setup Grader Parameters - Completed</title>
    </head>
    <body>
        <h2>Managed AWS Educate Classroom Setup Grader Parameters - Completed</h2>
        Email: ${parameters.email}<br/>
        Classroom: ${parameters.classroomName}<br/>
        Grader Function: ${parameters.gradeFunction}<br/>
        Parameters: <br/>
        <p>
        ${parameters.gradeFunctionParameters}
        </p>
        <footer>
          <p>Developed by <a href="https://www.vtc.edu.hk/admission/en/programme/it114115-higher-diploma-in-cloud-and-data-centre-administration/"> Higher Diploma in Cloud and Data Centre Administration Team.</a></p>
        </footer>
    </body>
</html>
        `,
        };
    }


};
