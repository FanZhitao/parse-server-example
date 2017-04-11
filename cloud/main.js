
console.log('loading cloud code.');
Parse.serverURL = 'http://localhost/parse/';
Parse.Cloud.define('hello', function(req, res) {
	res.success('Hi');
});

// Cloud Code entry point
/* Initialize the Stripe and Mailgun Cloud Modules */
var stripe = require('stripe')('sk_test_mHGVb5SSVjPVnYZDmeNDcBdQ');
//stripe.initialize('');
var api_key = 'key-0bced53ba7ee19f51fbeb677ec6b80b3';
var domain = 'sandbox99b8043ec7874e098726e23940199bb5.mailgun.org';
var mailgun = require('mailgun-js')({apiKey: api_key, domain: domain});
//mailgun.initialize('mobilewareinc.com', '0bced53ba7ee19f51fbeb677ec6b80b3');

/*
 * Purchase an item from the Parse Store using the Stripe
 * Cloud Module.
 *
 * Expected input (in request.params):
 *   itemName       : String, can be "Mug, "Tshirt" or "Hoodie"
 *   size           : String, optional for items like the mug 
 *   cardToken      : String, the credit card token returned to the client from Stripe
 *   name           : String, the buyer's name
 *   email          : String, the buyer's email address
 *   address        : String, the buyer's street address
 *   city_state     : String, the buyer's city and state
 *   zip            : String, the buyer's zip code
 *
 * Also, please note that on success, "Success" will be returned. 
 */
 Parse.serverURL = 'http://localhost:1337/parse';
 Parse.Cloud.define("purchaseItem", function(request, response) {
  // The Item and Order tables are completely locked down. We 
  // ensure only Cloud Code can get access by using the master key.
  Parse.Cloud.useMasterKey();

  // Top level variables used in the promise chain. Unlike callbacks,
  // each link in the chain of promise has a separate context.
  var item, order;

  // We start in the context of a promise to keep all the
  // asynchronous code consistent. This is not required.
  Parse.Promise.as().then(function() {
    // Find the item to purchase.
    var itemQuery = new Parse.Query('Item');
    itemQuery.equalTo('name', request.params.itemName);

    // Find the resuts. We handle the error here so our
    // handlers don't conflict when the error propagates.
    // Notice we do this for all asynchronous calls since we
    // want to handle the error differently each time.
    return itemQuery.first().then(null, function(error) {
    	return Parse.Promise.error('Sorry, this item is no longer available.');
    });

}).then(function(result) {
    // Make sure we found an item and that it's not out of stock.
    if (!result) {
    	return Parse.Promise.error('Sorry, this item is no longer available.');
    } else if (result.get('quantityAvailable') <= 0) { // Cannot be 0
    	return Parse.Promise.error('Sorry, this item is out of stock.');
    }

    // Decrease the quantity.
    item = result;
    item.increment('quantityAvailable', -1);

    // Save item.
    return item.save().then(null, function(error) {
    	console.log('Decrementing quantity failed. Error: ' + error);
    	return Parse.Promise.error('An error has occurred. Your credit card was not charged.');
    });

}).then(function(result) {
    // Make sure a concurrent request didn't take the last item.
    item = result;
    if (item.get('quantityAvailable') < 0) { // can be 0 if we took the last
    	return Parse.Promise.error('Sorry, this item is out of stock.');
    }

    // We have items left! Let's create our order item before
    // charging the credit card (just to be safe).
    order = new Parse.Object('Order');
    order.set('name', request.params.name);
    order.set('email', request.params.email);
    order.set('address', request.params.address);
    order.set('zip', request.params.zip);
    order.set('city_state', request.params.city);
    order.set('item', item);
    order.set('size', request.params.size || 'N/A');
    order.set('fulfilled', false);
    order.set('charged', false); // set to false until we actually charge the card
    order.set('user', request.user);
    order.set('itemName', request.params.itemName);
    order.set('price', request.params.price);
    order.set('image', request.params.image);
    order.set('quantity', request.params.quantity);

    // Create new order
    return order.save().then(null, function(error) {
      // This would be a good place to replenish the quantity we've removed.
      // We've ommited this step in this app.
      console.log('Creating order object failed. Error: ' + error);
      return Parse.Promise.error('An error has occurred. Your credit card was not charged.');
  });

}).then(function(order) { 
    // Now we can charge the credit card using Stripe and the credit card token.
    return stripe.charges.create({
      amount: item.get('price') * 100, // express dollars in cents 
      currency: 'usd',
      card: request.params.cardToken
  }).then(null, function(error) {
  	console.log('Charging with stripe failed. Error: ' + error);
  	return Parse.Promise.error('An error has occurred. Your credit card was not charged.');
  });

}).then(function(purchase) {
    // Credit card charged! Now we save the ID of the purchase on our
    // order and mark it as 'charged'.
    order.set('stripePaymentId', purchase.id);
    order.set('charged', true);

    // Save updated order
    return order.save().then(null, function(error) {
      // This is the worst place to fail since the card was charged but the order's
      // 'charged' field was not set. Here we need the user to contact us and give us
      // details of their credit card (last 4 digits) and we can then find the payment
      // on Stripe's dashboard to confirm which order to rectify.
      return Parse.Promise.error('A critical error has occurred with your order. Please ' +
      	'contact store@parse.com at your earliest convinience. ');
  });

}).then(function(order) {
    // Credit card charged and order item updated properly!
    // We're done, so let's send an email to the user.

    // Generate the email body string.
    var body = "We've received and processed your order for the following item: \n\n" +
    "Item: " + request.params.itemName + "\n";

    if (request.params.size && request.params.size !== "N/A") {
    	body += "Size: " + request.params.size + "\n";
    }

    body += "\nPrice: $" + item.get('price') + ".00 \n" +
    "Shipping Address: \n" +
    request.params.name + "\n" +
    request.params.address + "\n" +
    request.params.city_state + "," +
    "United States, " + request.params.zip + "\n" +
    "\nWe will send your item as soon as possible. " + 
    "Let us know if you have any questions!\n\n" +
    "Thank you,\n" +
    "The Parse Team";

    // Send the email.
    var data = {
    	from: 'Excited User <me@samples.mailgun.org>',
    	to: request.params.email,
    	subject: 'Your order for a Parse ' + request.params.itemName + ' was successful!',
    	text: body
    };
    return mailgun.messages().send(data, function (error, body) {
    	console.log(body);
    });

}).then(function() {
    // And we're done!
    response.success('Success');

  // Any promise that throws an error will propagate to this handler.
  // We use it to return the error from our Cloud Function using the 
  // message we individually crafted based on the failure above.
}, function(error) {
	response.error(error);
});
});
Parse.Cloud.define('addToCart', function(request, response) {
	console.log('add to cart called');
  // The Item and Order tables are completely locked down. We
  // ensure only Cloud Code can get access by using the master key.
  Parse.Cloud.useMasterKey();

  var item, cartItem;

  // We start in the context of a promise to keep all the
  // asynchronous code consistent. This is not required.
  Parse.Promise.as().then(function() {
  	var itemQuery = new Parse.Query('Item');
  	itemQuery.equalTo('name', request.params.itemName);

  	return itemQuery.first().then(null, function(error) {
  		return Parse.Promise.error('Item query error. ' + error.message);
  	});

  }).then(function(result) {
  	if (!result) {
  		return Parse.Promise.error('Sorry, this item is no longer available.');
  	} else if (result.get('quantityAvailable') < request.params.quantity) {
  		return Parse.Promise.error('Sorry, this item is out of stock.');
  	}

  	item = result;
  	var cartQuery = new Parse.Query('Cart');
  	cartQuery.equalTo('product', item);
  	cartQuery.equalTo('user', request.user);
  	cartQuery.equalTo('size', request.params.size || 'N/A');

  	return cartQuery.first().then(null, function(error) {
  		return Parse.Promise.error('Query cart error.');
  	});

  }).then(function(result) {
  	cartItem = result;
  	if (!cartItem) {
  		cartItem = new Parse.Object('Cart');
  		cartItem.set('user', request.user);
  		cartItem.set('product', item);
  		cartItem.set('quantity', request.params.quantity);
  		cartItem.set('size', request.params.size || 'N/A');
  	} else {
  		cartItem.increment('quantity', request.params.quantity);
  	}

  	return cartItem.save().then(null, function(error) {
  		console.log('Creating cart item failed. Error: ' + error);
  		return Parse.Promise.error('An error has occurred when adding a cart item. ' + error.message);
  	});
  }).then(function() {
    // And we're done!
    response.success('Success');

  // Any promise that throws an error will propagate to this handler.
  // We use it to return the error from our Cloud Function using the 
  // message we individually crafted based on the failure above.
}, function(error) {
	response.error(error);
});
});
Parse.Cloud.define('purchaseItemsInCart', function(request, response) {
  // The Item and Order tables are completely locked down. We
  // ensure only Cloud Code can get access by using the master key.
  Parse.Cloud.useMasterKey();

  var cartItems;

  // We start in the context of a promise to keep all the
  // asynchronous code consistent. This is not required.
  Parse.Promise.as().then(function() {
  	var itemsInCartQuery = new Parse.Query('Cart');
  	itemsInCartQuery.equalTo('user', request.user);

  	return itemsInCartQuery.find().then(null, function(error) {
  		return Parse.Promise.error('Cart query error.');
  	});

  }).then(function(results) {
  	if (!results) {
  		return Parse.Promise.error('No item in shopping cart.');
  	} else {
      // check if every product in cart is adequate
      var count = {};
      for (item in results) {
      	var product = item.get('product');
      	if (product in count) {
      		count[product] = count[product] + item.get('quantity');
      	} else {
      		count[product] = item.get('quantity');
      	}
      	if (product.get('quantityAvailable') < count[product]) {
      		return Parse.Promise.error('Sorry, ' + item.get('name') + ' is out of stock.');
      	}
      }
  }

  cartItems = results;
    // Decrease the quantity.
    for (item in results) {
    	var product = item.get('product');
    	product.increment('quantityAvailable', -item.get('quantity'));

      // Save item.
      return product.save().then(null, function(error) {
      	console.log('Decrementing quantity failed. Error: ' + error);
      	return Parse.Promise.error('An error has occurred. Your credit card was not charged.');
      });

  }
}).then(function(result) {
    // Make sure a concurrent request didn't take the last item.
    var item = result;
    if (item.get('quantityAvailable') < 0) { // can be 0 if we took the last
    	return Parse.Promise.error('Sorry, ' + item.get('name') + ' is out of stock.');
    }

    // We have items left! Let's create our order item before
    // charging the credit card (just to be safe).
    order = new Parse.Object('Order');
    order.set('name', item.name);
    order.set('email', request.params.email);
    order.set('address', request.params.address);
    order.set('zip', request.params.zip);
    order.set('city_state', request.params.city);
    order.set('item', item);
    order.set('size', request.params.size || 'N/A');
    order.set('fulfilled', false);
    order.set('charged', false); // set to false until we actually charge the card
    order.set('user', request.user);
    order.set('itemName', request.params.itemName);
    order.set('price', request.params.price);
    order.set('image', request.params.image);
    order.set('quantity', request.params.quantity);

    // Create new order
    return order.save().then(null, function(error) {
      // This would be a good place to replenish the quantity we've removed.
      // We've ommited this step in this app.
      console.log('Creating order object failed. Error: ' + error);
      return Parse.Promise.error('An error has occurred. Your credit card was not charged.');
  });

}).then(function(order) {
    // Now we can charge the credit card using Stripe and the credit card token.
    return stripe.charges.create({
      amount: item.get('price') * 100, // express dollars in cents
      currency: 'usd',
      card: request.params.cardToken
  }).then(null, function(error) {
  	console.log('Charging with stripe failed. Error: ' + error);
  	return Parse.Promise.error('An error has occurred. Your credit card was not charged.');
  });

}).then(function(purchase) {
    // Credit card charged! Now we save the ID of the purchase on our
    // order and mark it as 'charged'.
    order.set('stripePaymentId', purchase.id);
    order.set('charged', true);

    // Save updated order
    return order.save().then(null, function(error) {
      // This is the worst place to fail since the card was charged but the order's
      // 'charged' field was not set. Here we need the user to contact us and give us
      // details of their credit card (last 4 digits) and we can then find the payment
      // on Stripe's dashboard to confirm which order to rectify.
      return Parse.Promise.error('A critical error has occurred with your order. Please ' +
      	'contact store@parse.com at your earliest convinience. ');
  });

}).then(function(order) {
    // Credit card charged and order item updated properly!
    // We're done, so let's send an email to the user.

    // Generate the email body string.
    var body = "We've received and processed your order for the following item: \n\n" +
    "Item: " + request.params.itemName + "\n";

    if (request.params.size && request.params.size !== "N/A") {
    	body += "Size: " + request.params.size + "\n";
    }

    body += "\nPrice: $" + item.get('price') + ".00 \n" +
    "Shipping Address: \n" +
    request.params.name + "\n" +
    request.params.address + "\n" +
    request.params.city_state + "," +
    "United States, " + request.params.zip + "\n" +
    "\nWe will send your item as soon as possible. " +
    "Let us know if you have any questions!\n\n" +
    "Thank you,\n" +
    "The Parse Team";

    // Send the email.
    var data = {
    	from: 'Excited User <me@samples.mailgun.org>',
    	to: request.params.email,
    	subject: 'Your order for a Parse ' + request.params.itemName + ' was successful!',
    	text: body
    };
    return mailgun.messages().send(data, function (error, body) {
    	console.log(body);
    });

}).then(function() {
    // And we're done!
    response.success('Success');

  // Any promise that throws an error will propagate to this handler.
  // We use it to return the error from our Cloud Function using the
  // message we individually crafted based on the failure above.
}, function(error) {
	response.error(error);
});
});