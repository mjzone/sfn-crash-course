const AWS = require("aws-sdk");
const StepFunction = new AWS.StepFunctions();
const DynamoDB = require("aws-sdk/clients/dynamodb");
const DocumentClient = new DynamoDB.DocumentClient({ region: "us-east-1" });

const isBookAvailable = (book, quantity) => {
    return (book.quantity - quantity) > 0
}

module.exports.checkInventory = async ({ bookId, quantity }) => {
    try {
        let params = {
            TableName: 'bookTable',
            KeyConditionExpression: 'bookId = :bookId',
            ExpressionAttributeValues: {
                ':bookId': bookId
            }
        };
        let result = await DocumentClient.query(params).promise();
        let book = result.Items[0];

        if (isBookAvailable(book, quantity)) {
            return book;
        } else {
            let bookOutOfStockError = new Error("The book is out of stock");
            bookOutOfStockError.name = "BookOutOfStock";
            throw bookOutOfStockError;
        }
    } catch (e) {
        if (e.name === 'BookOutOfStock') {
            throw e;
        } else {
            let bookNotFoundError = new Error(e);
            bookNotFoundError.name = 'BookNotFound';
            throw bookNotFoundError;
        }
    }
}

module.exports.calculateTotal = async ({ book, quantity }) => {
    console.log("book: ", book);
    let total = book.price * quantity;
    return { total }
}

module.exports.billCustomer = async (params) => {
    console.log(params);
    // throw 'Error in billing'
    /* Bill the customer e.g. Using Stripe token from the paramerters */
    return "Successfully Billed"
}

const deductPoints = async (userId) => {
    let params = {
        TableName: 'userTable',
        Key: { 'userId': userId },
        UpdateExpression: 'set points = :zero',
        ExpressionAttributeValues: {
            ':zero': 0
        }
    };
    await DocumentClient.update(params).promise();
}

const updateBookQuantity = async (bookId, orderQuantity) => {
    console.log("bookId: ", bookId);
    console.log("orderQuantity: ", orderQuantity);
    let params = {
        TableName: 'bookTable',
        Key: { 'bookId': bookId },
        UpdateExpression: 'SET quantity = quantity - :orderQuantity',
        ExpressionAttributeValues: {
            ':orderQuantity': orderQuantity
        }
    };
    await DocumentClient.update(params).promise();
}
module.exports.redeemPoints = async ({ userId, total }) => {
    console.log("userId: ", userId);
    let orderTotal = total.total;
    console.log("orderTotal:", orderTotal);
    try {
        let params = {
            TableName: 'userTable',
            Key: {
                'userId': userId
            }
        };
        let result = await DocumentClient.get(params).promise();
        let user = result.Item;
        console.log("user: ", user);
        const points = user.points;
        console.log("points: ", points);
        if (orderTotal > points) {
            await deductPoints(userId);
            orderTotal = orderTotal - points;
            return { total: orderTotal, points }
        } else {
            throw new Error('Order total is less than redeem points');
        }
    } catch (e) {
        throw new Error(e);
    }
}

module.exports.restoreRedeemPoints = async ({ userId, total }) => {
    try {
        if (total.points) {
            let params = {
                TableName: 'userTable',
                Key: { userId: userId },
                UpdateExpression: 'set points = :points',
                ExpressionAttributeValues: {
                    ':points': total.points
                }
            };
            await DocumentClient.update(params).promise();
        }
    } catch (e) {
        throw new Error(e);
    }
}

module.exports.sqsWorker = async (event) => {
    try {
        console.log(JSON.stringify(event));
        let record = event.Records[0];
        var body = JSON.parse(record.body);
        /** Find a courier and attach courier information to the order */
        let courier = "<courier email>";

        // update book quantity
        await updateBookQuantity(body.Input.bookId, body.Input.quantity);

       // throw "Something wrong with Courier API";

        // Attach curier information to the order
        await StepFunction.sendTaskSuccess({
            output: JSON.stringify({ courier }),
            taskToken: body.Token
        }).promise();
    } catch (e) {
        console.log("===== You got an Error =====");
        console.log(e);
        await StepFunction.sendTaskFailure({
            error: "NoCourierAvailable",
            cause: "No couriers are available",
            taskToken: body.Token
        }).promise();
    }
}

module.exports.restoreQuantity = async ({ bookId, quantity }) => {
    let params = {
        TableName: 'bookTable',
        Key: { bookId: bookId },
        UpdateExpression: 'set quantity = quantity + :orderQuantity',
        ExpressionAttributeValues: {
            ':orderQuantity': quantity
        }
    };
    await DocumentClient.update(params).promise();
    return "Quantity restored"
}
