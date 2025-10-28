# Job Scraper

A comprehensive job scraping system that searches across multiple job portals (LinkedIn, Naukri, Indeed) and matches jobs based on your skills.

## Features

- 🔍 **Multi-source job search** across LinkedIn, Naukri, and Indeed
- 🎯 **Smart skill matching** with advanced scoring algorithms
- 📊 **Detailed analytics** and job statistics
- 🌐 **Web interface** for easy job searching
- 💻 **CLI interface** for power users
- 🚀 **REST API** for integration with other applications
- ⚡ **Parallel processing** for fast results
- 🛡️ **Rate limiting** to respect website policies

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd job_scraper
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables (optional):
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Usage

### Web Interface

Start the web server:
```bash
python app.py
```

Open your browser and go to `http://localhost:5000`

### CLI Interface

Search for jobs using the command line:
```bash
python cli.py --keywords "Python Developer" --location "Mumbai" --skills "Python" "Django" "AWS"
```

#### CLI Options

- `--keywords, -k`: Job keywords (required)
- `--location, -l`: Job location (required)
- `--skills, -s`: Your skills (required)
- `--sources`: Job sources to search (linkedin, naukri, indeed)
- `--max-results, -m`: Maximum number of results (default: 50)
- `--min-score`: Minimum match score (0.0-1.0)
- `--output, -o`: Output file for JSON results
- `--format`: Output format (json, table)

#### Examples

```bash
# Basic search
python cli.py -k "Software Engineer" -l "Bangalore" -s "Python" "React" "AWS"

# Search specific sources
python cli.py -k "Data Scientist" -l "Delhi" -s "Python" "Machine Learning" --sources linkedin naukri

# Save results to file
python cli.py -k "DevOps Engineer" -l "Remote" -s "Docker" "Kubernetes" -o results.json --format json

# Filter by match score
python cli.py -k "Full Stack Developer" -l "Pune" -s "JavaScript" "Node.js" --min-score 0.7
```

### API Usage

#### Search Jobs
```bash
curl -X POST http://localhost:5000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": ["Software Engineer"],
    "location": "Mumbai",
    "skills": ["Python", "Django", "AWS"],
    "sources": ["linkedin", "naukri", "indeed"],
    "max_results": 50
  }'
```

#### Health Check
```bash
curl http://localhost:5000/api/health
```

#### Get Available Sources
```bash
curl http://localhost:5000/api/sources
```

## Configuration

The scraper can be configured through the `config.py` file:

- **Rate limiting**: Control request delays and limits
- **Skills database**: Add or modify skill categories
- **Search parameters**: Customize search criteria
- **User agents**: Rotate user agents for better success rates

## Skill Matching

The system uses advanced skill matching algorithms:

1. **Exact matching**: Direct skill name matches
2. **Synonym matching**: Matches skills with their variations
3. **Partial matching**: Fuzzy matching for similar skills
4. **Category weighting**: Different weights for different skill categories

### Supported Skill Categories

- Programming Languages
- Web Technologies
- Databases
- Cloud Platforms
- Data Science
- Mobile Development
- DevOps Tools

## Job Sources

### LinkedIn
- Searches job postings on LinkedIn
- Extracts job title, company, location, and description
- Supports pagination for large result sets

### Naukri
- Uses both API and web scraping methods
- Extracts detailed job information including salary
- Optimized for Indian job market

### Indeed
- Web scraping approach for job listings
- Extracts comprehensive job details
- Supports multiple countries

## Rate Limiting

The scraper implements intelligent rate limiting:

- **LinkedIn**: 10 requests per minute
- **Naukri**: 15 requests per minute
- **Indeed**: 20 requests per minute

## Error Handling

- Automatic retry with exponential backoff
- Graceful handling of network errors
- Detailed error reporting
- Fallback mechanisms for failed requests

## Legal Considerations

⚠️ **Important**: This tool is for educational and personal use only. Please respect the terms of service of the job portals and use responsibly:

- Don't overload servers with too many requests
- Respect robots.txt files
- Use appropriate delays between requests
- Consider using official APIs when available

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Common Issues

1. **No results found**: Try adjusting keywords or location
2. **Rate limiting errors**: Increase delays in config.py
3. **Network errors**: Check your internet connection
4. **Parsing errors**: Some job sites may have changed their structure

### Debug Mode

Enable debug mode for detailed logging:
```bash
export DEBUG=1
python app.py
```

## Support

For issues and questions:
1. Check the troubleshooting section
2. Search existing issues
3. Create a new issue with detailed information

## Roadmap

- [ ] Add more job sources (Glassdoor, Monster, etc.)
- [ ] Implement job alerts and notifications
- [ ] Add job application tracking
- [ ] Create browser extension
- [ ] Add machine learning for better matching
- [ ] Implement job recommendation system
