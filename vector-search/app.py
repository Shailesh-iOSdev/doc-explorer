"""
Advanced Search Service using scikit-learn
Provides intelligent search with TF-IDF, n-grams, and nearest neighbors
No external model downloads required - works offline!
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import normalize
from sklearn.metrics.pairwise import cosine_similarity
import logging
from datetime import datetime
import re
import scipy.sparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Advanced Search Service",
    version="1.0.0",
    description="Intelligent search using scikit-learn with TF-IDF and nearest neighbors"
)

#Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =======================
# Request/Response Models
# ========================

class Document(BaseModel):
    """Document to be indexed"""
    id: str
    title: str
    content: str
    metadata: Optional[Dict] = {}

class SearchQuery(BaseModel):
    """Search query with parameters"""
    query: str
    top_k: int = 5
    threshold: float = 0.10 # Lower threshold for hybrid scoring

class SearchResult(BaseModel):
    """Individual search result"""
    id: str
    title: str
    content: str
    score: float
    metadata: Dict

class IndexRequest(BaseModel):
    """Request to index documents"""
    documents: List[Document]
    clear_existing: bool = False

class IndexStats (BaseModel):
    """Index statistics"""
    total_documents: int
    vocabulary_size: int
    index_ready: bool
    last_updated: Optional[str] = None

# =======================================
#Advanced Search Engine with scikit-learn
# =======================================

class AdvancedSearchEngine:
    """
    Intelligent search engine using scikit-learn
    Features: BM25, TF-IDF, n-grams, field boosting, hybrid scoring
    """

    def __init__(self):
        """Initialize the search engine"""
        logger.info("Initializing Advanced Search Engine with BM25")

        # BM25 parameters
        self.k1 = 1.5 # Term frequency saturation
        self.b = 0.75 # Length normalization

        # Initialize TF-IDF vectorizer with advanced features
        self.vectorizer = TfidfVectorizer(
            max_features=10000,
            ngram_range=(1, 3), # Unigrams, bigrams, trigrams
            min_df=1,
            max_df=0.95,
            sublinear_tf=True,
            analyzer='word',
            stop_words='english',
            token_pattern=r'\b\w{2,}\b',
            lowercase=True,
            strip_accents='unicode'
        )

        # Count vectorizer for BM25
        self.count_vectorizer = CountVectorizer(
            max_features=10000,
            ngram_range=(1, 3),
            min_df=1,
            max_df=0.95,
            analyzer='word',
            stop_words='english',
            token_pattern=r'\b\w{2,}\b',
            lowercase=True,
            strip_accents='unicode'
        )

        # Storage
        self.documents = []
        self.doc_vectors = None
        self.doc_counts = None
        self.doc_lengths = None
        self.avgdl = 0
        self.idf = None
        self.last_updated = None

        logger.info("Advanced Search Engine initialized with BM25")

    def _preprocess_text(self, doc: Document) -> str:
        """
        Preprocess document with field boosting
        Title gets 3x weight, code blocks get 2x weight
        """
        content = doc.content

        # Extract and boost code blocks (markdown code fences)
        code_patten = r'```[\s\S]*?`'
        code_blocks = re.findall(code_patten, content)

        # Boost title by repeating it
        title_boosted = ' '.join([doc.title] * 3)

        # Boost code blocks by repeating them
        code_boosted = ''
        if code_blocks:
            # Clean code blocks and repeat
            cleaned_code = ' '.join(
                block.replace('``', '').strip()
                for block in code_blocks
            )
            code_boosted = ' '+ ''.join([cleaned_code] * 2)

        return f"{title_boosted} {content} {code_boosted}"

    def _expand_query(self, query: str) -> str:
        """
        Expand query with comprehensive synonyms for better matching
        """
        # Comprehensive technical documentation synonyms
        synonyms = {
            'auth': ['authentication', 'authorization', 'login', 'signin', 'access', 'credentials', 'token', 'oauth'],
            'api': ['endpoint', 'service', 'rest', 'interface', 'method', 'route', 'resource'],
            'error': ['exception', 'failure', 'issue', 'problem', 'bug', 'fault', 'warning'],
            'create': ['add', 'make', 'generate', 'new', 'insert', 'build', 'initialize'],
            'update': ['modify', 'change', 'edit', 'alter', 'revise', 'patch'],
            'delete': ['remove', 'destroy', 'erase', 'drop', 'purge'],
            'get': ['retrieve', 'fetch', 'obtain', 'read', 'query', 'find', 'search'],
            'list': ['show', 'display', 'enumerate', 'index', 'view'],
            'user': ['account', 'profile', 'member', 'customer', 'person'],
            'data': ['information', 'content', 'record', 'entry', 'details'],
            'config': ['configuration', 'settings', 'options', 'preferendes', 'parameters'],
            'how': ['guide', 'tutorial', 'instructions', 'steps', 'process', 'method'],
            'what': ['description', 'definition', 'explanation', 'details', 'information'],
            'why': ['reason', 'purpose', 'explanation', 'rationale'],
            'when': ['timing', 'schedule', 'time', 'duration'],
            'where': ['location', 'place', 'endpoint', 'url', 'path'],
        }

        query_lower = query.lower()
        expanded_terms = [query]

        # Match whole words only
        for key, synonyms_list in synonyms.items():
            # Use word boundary matching
            if re.search(r'\b' + re.escape(key) + r'\b', query_lower):
                expanded_terms.extend(synonyms_list[:4]) # Add top 4

        return ''.join(expanded_terms)

    def add_documents (self, documents: List[Document], clear_existing: bool = False):
        """
        Index documents with BM25 and TF-IDF
        """
        if not documents:
            logger.warning("No documents provided for indexing")
            return

        if clear_existing:
            logger.info("Clearing existing index")
            self.documents = []
            self.doc_vectors = None
            self.doc_counts = None

        logger.info(f"Indexing {len(documents)} documents with BM25...")
        start_time = datetime.now()

        # Store documents
        self.documents.extend(documents)

        # Prepare texts with field boosting
        all_texts = [self._preprocess_text(doc) for doc in self.documents]

        # Generate TF-IDF vectors
        logger.info("Generating TF-IDF vectors...")
        self.doc_vectors = self.vectorizer.fit_transform(all_texts)

        # Generate count vectors for BM25
        logger.info("Generating BM25 statistics...")
        self.doc_counts = self.count_vectorizer.fit_transform(all_texts)

        # Calculate document lengths for BM25
        if isinstance(self.doc_counts, scipy.sparse.spmatrix):
            doc_count_array = self.doc_counts.toarray() # type: ignore
        else:
            doc_count_array = self.doc_counts            
        self.doc_lengths = np.array(doc_count_array.sum(axis=1)).flatten()
        self.avgdl = np.mean(self.doc_lengths)

        # Calculate IDF for BM25
        N = len(self.documents)
        df = np.array((doc_count_array > 0).sum(axis=0)).flatten()
        self.idf = np.log( (N - df + 0.5) / (df + 0.5) + 1)

        # Normalize TF-IDF vectors
        self.doc_vectors = normalize(self.doc_vectors, norm='l2')

        self.last_updated = datetime.now().isoformat()

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(
            f"Successfully indexed {len(documents)} documents in {elapsed:.2f}s. "
            f"Total: {len(self.documents)} documents, "
            f"Vocabulary: {len(self.vectorizer.vocabulary_)} terms, "
            f"Avg doc length: {self.avgdl:.1f} terms"
        )

    def search(self, query: str, top_k: int = 5, threshold: float = 0.15) -> List[SearchResult]:
        """
        Perform hybrid search with BM25 and TF-IDF scoring
        """
        if not self.documents or self.doc_vectors is None:
            logger.warning("No documents indexed yet")
            return []

        logger.info(f"Searching for: '{query[:100]}...' (top_k={top_k})")
        start_time = datetime.now()

        # Expand query with synonyms
        expanded_query = self._expand_query(query)
        logger.info(f"Expanded query: '{expanded_query[:150]}...'")

        # Generate query vectors
        query_tfidf = self.vectorizer.transform([expanded_query])
        query_tfidf = normalize(query_tfidf, norm='l2')
        query_counts = self.count_vectorizer.transform( [expanded_query])

        # Calculate TF-IDF cosine similarity
        tfidf_scores = cosine_similarity(query_tfidf, self.doc_vectors).flatten()

        # Calculate BM25 scores
        bm25_scores = self.calculate_bm25(query_counts)

        # Hybrid scoring: combine BM25 (60%) and TF-IDF (40%)
        # BM25 is better for exact term matching, TF-IDF for semantic similarity
        # Normalize scores to 0-1 range
        bm25_normalized = bm25_scores / (bm25_scores.max() + 1e-10)
        tfidf_normalized = tfidf_scores

        hybrid_scores = 0.6 * bm25_normalized + 0.4 * tfidf_normalized

        # Get top results above threshold
        top_indices = np.argsort(hybrid_scores)[::-1]

        results = []
        for idx in top_indices:
            score = hybrid_scores[idx]
            if score >= threshold and len(results) < top_k:
                doc = self.documents[idx]
                results.append(SearchResult(
                    id=doc.id,
                    title=doc.title,
                    content=doc.content,
                    score=float(score),
                    metadata=doc.metadata or {}
                ))

        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(
            f"Found {len(results)} results above threshold {threshold} "
            f"in {elapsed+1000:.0f}ms"
            )

        # Log top result for debugging
        if results:
            logger.info(f"Top result: '{results[0].title}' (score: {results[0].score:.3f})")
        
        return results

    def calculate_bm25(self, query_counts):
        """
        Calculate BM25 scores for query against all documents
        BM25 formula: IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgdl)))
        """
        query_array = query_counts.toarray()[0]
        if self.doc_counts is None:
            raise ValueError("Document counts are not initialized. Please index document first")
        doc_array = self.doc_counts.toarray() # type: ignore

        scores = np.zeros(len(self.documents))

        for term_idx, query_tf in enumerate(query_array):
            if query_tf == 0:
                continue

            # Get document term frequencies
            doc_tfs = doc_array[:, term_idx]

            # BM25 formula
            numerator = doc_tfs * (self.k1 + 1)
            denominator = doc_tfs + self.k1 * (1 - self.b + self.b * (self.doc_lengths / self.avgdl)) # type: ignore

            # Add IDF weighted term scores
            scores += self.idf[term_idx] * (numerator / denominator) # type: ignore

        return scores

    def clear(self):
        """Clear all indexed documents"""
        self.documents = []
        self.doc_vectors = None
        self.doc_counts = None
        self.doc_lengths = None
        self.avgdl = 0
        self.idf = None
        self.last_updated = None
        logger.info("Index cleared")

    def get_stats(self) -> IndexStats:
        """Get index statistics"""
        vocab_size = len(self.vectorizer.vocabulary_) if hasattr(self.vectorizer, 'vocabulary_') else 0
        return IndexStats(
            total_documents=len(self.documents),
            vocabulary_size=vocab_size,
            index_ready=len(self.documents) > 0 and self.doc_vectors is not None,
            last_updated=self.last_updated
        )


search_engine = AdvancedSearchEngine()

# ==============================
# API Endpoints
# =============================

@app.on_event("startup")
async def startup_event():
    """Log startup information"""
    logger.info("=" * 60)
    logger.info("Advanced Search Service Starting")
    logger.info("Using: BM25 + TF-IDF Hybrid Search")
    logger.info("=" * 60)

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "Advanced Search Service",
        "version": "2.0.0",
        "status": "running",
        "engine": "BM25 + TF-IDF Hybrid (scikit-learn)",
        "features": {
            "BM25 ranking algorithm (state-of-the-art)",
            "TF-IDF semantic similarity",
            "Hybrid scoring (BM25 60% + TF-IDF 40%)",
            "N-grams (1-3) for phrase matching",
            "Field boosting (title 3x)",
            "Comprehensive synonym expansion",
            "Sublinear TF scalíng"
        },
        "endpoints": {
            "health": "/health",
            "index": "POST /index",
            "search": "POST /search",
            "stats": "/stats",
            "clear": "POST /clear"
        }
    }

@app.get("/health")
async def health():
    """Health check with index statisticS"""
    stats = search_engine.get_stats()
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "stats": stats.dict()
    }
        

@app.post("/index")
async def index_documents(request: IndexRequest):
    """
    Index documents for search

    Body:
    documents: List of documents with id, title, content
    clear_existing: Clear existing index before adding (default: false)
    """
    try:
        search_engine.add_documents(
        request.documents,
        clear_existing=request.clear_existing
        )
        stats = search_engine.get_stats()

        return {
            "success": True,
            "indexed": len(request.documents),
            "total": stats.total_documents,
            "vocabulary_size": stats.vocabulary_size,
            "last_updated": stats.last_updated
        }
    except Exception as e:
        logger.error(f"Error indexing documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search", response_model=List[SearchResult])
async def search(query: SearchQuery):
    """
    Perform intelligent search
    Body:
    query: Natural language search query
    top_k: Number of results to return (default: 5)
    threshold: Minimum similarity score 0-1 (default: 0.15)
    """
    try:
        if not query.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        results = search_engine.search(
            query=query.query,
            top_k=query.top_k,
            threshold=query.threshold
        )
        return results
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during search: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/clear")
async def clear_index():
    """clear all indexed documents"""
    try:
        search_engine.clear()
        return {
        "success": True,
        "message": "Index cleared successfully"
        }
    except Exception as e:
        logger.error(f"Error clearing index: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stats", response_model=IndexStats)
async def get_stats():
    """Get detailed index statistics"""
    return search_engine.get_stats()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info"
    )