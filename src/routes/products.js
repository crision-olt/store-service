const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const { parseListQuery, parseProductInput } = require('../utils/product-query');

router.use(authenticateToken);

const UNIQUE_VIOLATION = '23505';

// Create product
router.post('/', async (req, res) => {
  const { product: input, error } = parseProductInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const product = await Product.create(input);
    res.status(201).json(product);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// List products with filters, sorting and pagination
router.get('/', async (req, res) => {
  const { filters, error } = parseListQuery(req.query);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    res.status(200).json(await Product.findAll(filters));
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Distinct categories (declared before /:id so it is not captured as an id)
router.get('/categories', async (req, res) => {
  try {
    res.status(200).json(await Product.findCategories());
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Distinct subcategories, optionally within one category (declared before /:id)
router.get('/subcategories', async (req, res) => {
  const { category } = req.query;
  if (category !== undefined && typeof category !== 'string') {
    return res.status(400).json({ error: 'category must be a string' });
  }

  try {
    res.status(200).json(await Product.findSubcategories(category?.trim() || undefined));
  } catch (err) {
    console.error('List subcategories error:', err);
    res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});

// Get product by id
router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
    return res.status(400).json({ error: 'Product id must be a positive integer' });
  }

  try {
    const product = await Product.findById(Number(req.params.id));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(200).json(product);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
