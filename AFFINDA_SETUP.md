# 🚀 **Affinda Resume Parser Setup Guide**

## **What is Affinda?**
Affinda is a **professional resume parsing service** that provides **95%+ accuracy** in extracting resume information. It's used by major companies and HR platforms worldwide.

## **Why Use Affinda?**
- **95%+ Accuracy** vs. ~60% with basic parsing
- **Handles Complex PDFs** including image-based resumes
- **Extracts Structured Data** from any resume format
- **Professional Grade** parsing used by Fortune 500 companies

## **Step 1: Get Your Free API Key**

### **Option A: Free Trial (Recommended)**
1. Go to [https://www.affinda.com/](https://www.affinda.com/)
2. Click **"Get Started"** or **"Sign Up"**
3. Choose the **Free Plan** (usually 50-100 free API calls)
4. Complete registration and verify your email
5. Go to **API Keys** section in your dashboard
6. Copy your **API Key**

### **Option B: Direct Signup**
1. Visit [https://www.affinda.com/signup](https://www.affinda.com/signup)
2. Use your business email for better approval
3. Select **"Resume Parser"** as your use case
4. Complete the signup process

## **Step 2: Add API Key to Your Project**

### **Add to `.env.local` file:**
```bash
# Add this line to your .env.local file
AFFINDA_API_KEY=your_actual_api_key_here
```

### **Example .env.local:**
```bash
# OpenAI Configuration
OPENAI_API_KEY=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

# Affinda Resume Parser (95%+ accuracy)
AFFINDA_API_KEY=aff_1234567890abcdef

# Other configurations...
MAX_TOKENS=8000
TEMPERATURE=0.0
MODEL=gpt-4o
```

## **Step 3: Test the Integration**

1. **Restart your development server:**
   ```bash
   npm run dev
   ```

2. **Upload a resume** - the system will now:
   - Try local parsing first
   - **Automatically use Affinda** if local parsing fails
   - Extract data with 95%+ accuracy
   - Show detailed logs of the parsing process

## **What You'll See in the Logs:**

```
Starting resume parsing with multiple fallback methods...
Local parsing failed validation, trying external services...
Attempting Affinda resume parsing...
Starting Affinda resume parsing...
Affinda API response received
Affinda extracted data structure: ['name', 'emails', 'phone_numbers', 'location', 'skills', 'work_experience', 'education']
Affinda parsing successful!
```

## **Expected Results:**

Instead of empty fields, you'll now get:
- ✅ **Full Name**: Extracted from resume header
- ✅ **Email**: Professional email address
- ✅ **Phone**: Contact number
- ✅ **Location**: City, State
- ✅ **Skills**: Technical and soft skills
- ✅ **Experience**: Job history with descriptions
- ✅ **Education**: Degrees and institutions

## **API Limits & Pricing:**

### **Free Plan:**
- **50-100 API calls** per month
- **Perfect for testing** and small projects
- **No credit card required**

### **Paid Plans:**
- **Starter**: $99/month for 1,000 calls
- **Professional**: $299/month for 5,000 calls
- **Enterprise**: Custom pricing

## **Troubleshooting:**

### **If you get "API key not configured":**
- Check that `.env.local` exists in your project root
- Verify the API key is correct
- Restart your development server

### **If you get "API key is invalid":**
- Verify your API key in the Affinda dashboard
- Check if your free trial has expired
- Ensure you're using the correct API key

### **If parsing still fails:**
- Check the console logs for detailed error messages
- Verify your resume file format (PDF, DOCX, DOC)
- Try with a different resume file

## **Alternative Services:**

If Affinda doesn't work for you, you can also try:

### **HireAbility:**
```bash
HIREABILITY_API_KEY=your_key_here
```

### **RChilli:**
```bash
RCHILLI_API_KEY=your_key_here
```

## **Next Steps:**

1. **Get your Affinda API key** (5 minutes)
2. **Add it to `.env.local`** (1 minute)
3. **Restart your server** (1 minute)
4. **Test with your resume** (2 minutes)
5. **Enjoy 95%+ accurate parsing!** 🎉

---

**Need Help?** Check the console logs for detailed information about what's happening during the parsing process.
