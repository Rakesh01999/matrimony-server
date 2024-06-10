const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uuibjb3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const userCollection = client.db("matrimonyDb").collection("users");
        const biodataCollection = client.db("matrimonyDb").collection("biodata");
        const favouriteBiodataCollection = client.db("matrimonyDb").collection("favouriteBiodata");
        const paymentCollection = client.db("matrimonyDb").collection("payments");
        const premReqCollection = client.db("matrimonyDb").collection("premiumRequests");
        const successStoryCollection = client.db("matrimonyDb").collection("successStory");
        const countersCollection = client.db("matrimonyDb").collection("counters");



        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            });
            res.send({ token });
        })


        // middlewares
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token',req.headers);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // user related api
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            // app.get('/users', verifyToken, async (req, res) => {
            console.log(req.headers);
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // app.get('/users/admin/:email', verifyToken, async (req, res) => {

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert eamil if user does not exists:
            // you can do this in many ways (1. email unique, 2. upsert, 3. simple checking)
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            // app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.patch('/users/premium/:id', verifyToken, verifyAdmin, async (req, res) => {
            // app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    // role: 'admin'
                    userType: 'premium'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            // app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


        // ------ biodata api ---------

        app.get('/biodatas', async (req, res) => {
            const result = await biodataCollection.find().toArray();
            res.send(result);
        });

        app.get('/biodatas/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await biodataCollection.findOne(query);
            res.send(result);
        });

        // New endpoint for filtering by type and limiting results
        app.get('/filtered-biodatas', async (req, res) => {
            const { type, limit } = req.query;
            const query = {};

            if (type) {
                query.BiodataType = type;
            }

            const options = {};
            if (limit) {
                options.limit = parseInt(limit);
            }

            const result = await biodataCollection.find(query, options).toArray();
            res.send(result);
        });


        // Function to generate the next BiodataId
        app.post('/biodatas', async (req, res) => {
            const newBiodata = req.body;

            try {
                // Find the biodata with the highest BiodataId
                const lastBiodata = await biodataCollection.find().sort({ BiodataId: -1 }).limit(1).toArray();
                console.log('lastBiodata: ', lastBiodata)
                console.log('lastBiodata- BiodataId ', lastBiodata[0].BiodataId)
                console.log('lastBiodata- BiodataId type: ', typeof lastBiodata[0].BiodataId)
                const lastBioId = parseInt(lastBiodata[0].BiodataId);
                console.log('lastBioId type: ', typeof lastBioId)
                console.log('lastBioId : ', lastBioId)
                let newBiodataId = 1;
                if (lastBiodata.length > 0) {
                    // newBiodataId = lastBiodata[0].BiodataId + 1;
                    newBiodataId = lastBioId + 1;
                    // newBiodataId = lastBiodata[0].bioId + 1;
                    // newBiodataId = lastBiodata + 1;
                }
                console.log('newBiodataId: ', newBiodataId);

                // Set the new BiodataId
                newBiodata.BiodataId = newBiodataId;
                // console.log('newBiodata: ',newBiodata);
                // console.log('newBiodata- BiodataId ',newBiodata.BiodataId);
                // console.log('newBiodata- BiodataId type: ', typeof newBiodata.BiodataId);

                const result = await biodataCollection.insertOne(newBiodata);
                res.send(result);
            } catch (error) {
                console.error('Failed to create biodata', error);
                res.status(500).send({ message: 'Failed to create biodata' });
            }
        });

        // app.get('/biodatas/:email', async (req, res) => {
        //     const email = req.params.email;
        //     const query = { ContactEmail: email };
        //     // console.log(query);
        //     try {
        //         await client.connect();
        //         const database = client.db('matrimonyDb');
        //         const biodataCollection = database.collection('biodata');

        //         const biodata = await biodataCollection.findOne(query);

        //         if (biodata) {
        //             res.json(biodata);
        //         } else {
        //             res.status(404).json({ message: 'Biodata not found' });
        //         }
        //     } catch (err) {
        //         console.error(err);
        //         res.status(500).json({ message: 'Server error' });
        //     } finally {
        //         await client.close();
        //     }
        // });



        // ---------- favouriteBiodataCollection ---------
        app.get('/favouriteBiodata', async (req, res) => {
            const cursor = favouriteBiodataCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/favouriteBiodata/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await favouriteBiodataCollection.findOne(query);
            res.send(result);
        })


        // app.post('/favouriteBiodata', async (req, res) => {
        //     const newFavouriteBiodata = req.body;
        //     const result = await favouriteBiodataCollection.insertOne(newFavouriteBiodata);
        //     res.send(result);
        // });

        // --------
        app.post('/favouriteBiodata', async (req, res) => {
            const favouriteBiodata = req.body;
            const query = { userId: favouriteBiodata.userId, BiodataId: favouriteBiodata.BiodataId };
            const existingFavourite = await favouriteBiodataCollection.findOne(query);

            if (existingFavourite) {
                res.status(400).send({ message: 'This biodata is already in your favorites.' });
            } else {
                const result = await favouriteBiodataCollection.insertOne(favouriteBiodata);
                res.send(result);
            }
        });

        app.get('/favouriteBiodata/:email', async (req, res) => {
            const query = { email: req.params.email }
            // if (req.params.email !== req.decoded.email) {
            //     return res.status(403).send({ message: 'forbidden access' });
            // }
            const result = await favouriteBiodataCollection.find().toArray();
            res.send(result);
        })

        app.delete('/favouriteBiodata/:id', async (req, res) => {
            // app.delete('/payments/:id', verifyToken,  async (req, res) => {
            // app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await favouriteBiodataCollection.deleteOne(query);
            res.send(result);
        })

        // ----------- checkOut ----------
        app.get('/checkOut/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await biodataCollection.findOne(query);
            res.send(result);
        });

        // ----- contactRequest intent / payment ----
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent');

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.get('/payments', async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
            // console.log('premium Request  info', premiumRequest);
            // res.send(premiumRequestResult );
        });

        // app.get('/payments/:email', verifyToken, async (req, res) => {
        app.get('/payments/:email', async (req, res) => {
            const query = { email: req.params.email }
            // if (req.params.email !== req.decoded.email) {
            //     return res.status(403).send({ message: 'forbidden access' });
            // }
            const result = await paymentCollection.find().toArray();
            res.send(result);
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            // carefully delete each item from the cart
            console.log('payment info', payment);
            // res.send(paymentResult);

            const query = {
                _id: {
                    // $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };

            // const deleteResult = await cartCollection.deleteMany(query);

            // res.send({ paymentResult, deleteResult });
            res.send({ paymentResult });
        })


        app.delete('/payments/:id', async (req, res) => {
            // app.delete('/payments/:id', verifyToken,  async (req, res) => {
            // app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await paymentCollection.deleteOne(query);
            res.send(result);
        })


        app.patch('/payments/approveContact/:id', verifyToken, verifyAdmin, async (req, res) => {
            // app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    // role: 'admin'
                    // userType: 'premium'
                    status: 'approved'
                }
            }
            const result = await paymentCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // ---------- premiumRequests --------
        app.get('/premiumRequests', async (req, res) => {
            // const result = await biodataCollection.find().toArray();
            // res.send(result);
            const premiumRequestResult = await premReqCollection.find().toArray();

            // console.log('premium Request  info', premiumRequest);
            res.send(premiumRequestResult);
        });

        app.get('/premiumRequests/:email', async (req, res) => {
            const query = { email: req.params.email }
            // if (req.params.email !== req.decoded.email) {
            //     return res.status(403).send({ message: 'forbidden access' });
            // }
            const result = await premReqCollection.find().toArray();
            res.send(result);
        });

        // app.get('/premiumRequests/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: new ObjectId(id) }
        //     const result = await premReqCollection.findOne(query);
        //     res.send(result);
        // });

        // const { ObjectId } = require('mongodb'); // Ensure ObjectId is imported


        app.get('/premiumRequests/:id', async (req, res) => {
            const id = req.params.id;
            let result;
            try {
                const query = { _id: new ObjectId(id) };
                result = await premReqCollection.findOne(query);
                if (!result) {
                    return res.status(404).send({ message: 'Data not found' });
                }
            } catch (error) {
                return res.status(500).send({ message: 'Internal server error', error });
            }
            res.send(result);
        });


        app.post('/premiumRequests', async (req, res) => {
            const premiumRequest = req.body;
            const premiumRequestResult = await premReqCollection.insertOne(premiumRequest);

            // console.log('premium Request  info', premiumRequest);
            res.send({ premiumRequestResult });
        });

        app.delete('/premiumRequests/:id', verifyToken, verifyAdmin, async (req, res) => {
            // app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await premReqCollection.deleteOne(query);
            res.send(result);
        });

        app.patch('/premiumRequests/premium/:id', verifyToken, verifyAdmin, async (req, res) => {
            // app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    // role: 'admin'
                    userType: 'premium'
                }
            }
            const result = await premReqCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });


        // ---------- successStory -----------
        app.get('/successStory', async (req, res) => {
            const result = await successStoryCollection.find().toArray();
            res.send(result);
        });

        app.post('/successStory', async (req, res) => {
            const successStory = req.body;
            const successStoryResult = await successStoryCollection.insertOne(successStory);

            console.log('successStory info', successStory);
            res.send({ successStoryResult });
        });

        app.delete('/successStory/:id', verifyToken, verifyAdmin, async (req, res) => {
            // app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await successStoryCollection.deleteOne(query);
            res.send(result);
        });


        // --------- counters related-------
        app.get('/counters', async (req, res) => {
            try {
                const totalBiodataCount = await biodataCollection.countDocuments();
                const girlsBiodataCount = await biodataCollection.countDocuments({ BiodataType: 'Female' });
                const boysBiodataCount = await biodataCollection.countDocuments({ BiodataType: 'Male' });
                const completedMarriagesCount = await successStoryCollection.countDocuments();

                // console.log(totalBiodataCount,girlsBiodataCount, boysBiodataCount,completedMarriagesCount)
                res.send({
                    totalBiodata: totalBiodataCount,
                    girlsBiodata: girlsBiodataCount,
                    boysBiodata: boysBiodataCount,
                    completedMarriages: completedMarriagesCount
                });
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch counters', error });
            }
        });


        //  ----------- stats ------------


        // app.get('/biodata-stats', verifyToken, verifyAdmin, async (req, res) => {
        app.get('/biodata-stats',  async (req, res) => {
            try {
                const totalBiodata = await biodataCollection.countDocuments();
                const maleBiodata = await biodataCollection.countDocuments({ BiodataType: 'Male' });
                const femaleBiodata = await biodataCollection.countDocuments({ BiodataType: 'Female' });
                const premiumBiodata = await premReqCollection.countDocuments({ userType: "premium" });
                // const contactReqBiodata = await paymentCollection.countDocuments({ status: "approved" });
                const contactReqBiodata = await paymentCollection.countDocuments();

                res.json({
                    totalBiodata,
                    maleBiodata,
                    femaleBiodata,
                    premiumBiodata,
                    contactReqBiodata
                });
            } catch (error) {
                console.error('Error fetching biodata statistics:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Revenue Endpoint
        // app.get('/revenue', verifyToken, verifyAdmin, async (req, res) => {
        // app.get('/revenue',  async (req, res) => {
        //     try {
        //         const totalRevenue = await paymentCollection.aggregate([
        //             { $match: { status: 'paid' } }, // Assuming 'paid' is the status for successful payments
        //             { $group: { _id: null, total: { $sum: '$amount' } } }
        //         ]).toArray();

        //         res.json({ totalRevenue: totalRevenue[0]?.total || 0 });
        //     } catch (error) {
        //         console.error('Error fetching revenue:', error);
        //         res.status(500).json({ error: 'Internal server error' });
        //     }
        // });

        // ----------

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('matrimony is running');
})

app.listen(port, () => {
    console.log(`matrimony is running on port ${port}`);
})

