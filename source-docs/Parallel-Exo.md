# **Senior AI Engineer | Senior Full-Stack Engineer**

\<aside\>  
 💡

Feel free to reach out to me (chris@beparallel.com) for your submission or if you have any question. You should send the access to your work at least 24 hours before the restitution.

\</aside\>

# **Instructions Technical Test**

\<aside\>  
 🎯

**Objective**

\</aside\>

Build a RAG (Retrieval-Augmented Generation) system to improve the quality of responses from an LLM Agent used for suggesting medical codes.

An advanced RAG system can be complex and time-consuming to implement. The goal here is to **deliver a working solution in approximately 3 to 4 hours**. We will primarily evaluate design logic, implementation, technical choices, and documentation.

\<aside\>  
 👩‍⚕️

**Context**

\</aside\>

As part of the [PMSI](https://fr.wikipedia.org/wiki/Programme_de_m%C3%A9dicalisation_des_syst%C3%A8mes_d%27information), one of the crucial steps in medical coding involves translating certain medical information into codes governed by the `CIM-10`. This is a comprehensive nomenclature grouping codes for diseases, diagnoses, and symptoms.

The `CIM-10` is the French version of the World Health Organization (WHO)’s coding system and includes additional information and guidance on how to associate or select specific codes.

A group of experts has developed an annotated and commented version of this `CIM-10`, including "coding rules". This document is called `CoCoA`.

To help you understand CIM-10 codes, you can use the [Aide au Codage](https://www.aideaucodage.fr/cim) website.

You may also:

* Research synonyms or associations for diseases/symptoms/diagnoses  
* Verify generated medical codes → lookup based on codes  
* Retrieve codes that are statistically often associated with the queried one

\<aside\>  
 🧑‍💻

**Details & Constraints**

\</aside\>

* Documents used for the RAG System

   This `CoCoA` document should be used to build the RAG system.

   [CoCoA.pdf](https://prod-files-secure.s3.us-west-2.amazonaws.com/10fb2453-6f07-4694-8ca7-5ca23ea4e52f/b16fb9ef-35bb-45c6-b8e4-1b747362d6cf/CoCoA.pdf)

* Input

   The input to this system will be a short piece of text (maximum 100 characters) corresponding to a diagnosis, symptom, or disease. Here are some example inputs you can use to design and test your solution:

`inputs`

 1\.	Dyspnée (difficulté respiratoire) à l’effort et à la parole  
2\.	Toux purulente  
3\.	Fièvre  
4\.	Œdème des membres inférieurs  
5\.	Hyponatrémie (faible taux de sodium)  
6\.	Hypercalcémie (taux élevé de calcium)  
7\.	Syndrome inflammatoire (CRP élevée)  
8\.	Hyperleucocytose (augmentation des globules blancs)  
9\.	Désaturation à l’effort (saturation d’oxygène à 80 %)  
10\.	Râles crépitants bilatéraux  
11\.	Tachycardie  
12\.	Acidose mixte avec hyperlactatémie  
13\.	Détresse respiratoire aiguë  
14\.	Altération de la conscience (stade terminal)  
15\.	Pneumopathie d’hypersensibilité  
16\.	Hypertension pulmonaire (groupes 2 et 3\)  
17\.	Dyslipidémie  
18\.	Hypertension artérielle (HTA)  
19\.	Diabète de type 2 non insulinodépendant  
20\.	Fibrillation auriculaire  
21\.	Syndrome d’apnées obstructives du sommeil (SAOS) appareillé par PPC  
22\.	Infection pulmonaire à Haemophilus influenzae  
23\.	Insuffisance respiratoire aiguë hypoxémique sur décompensation cardiaque globale  
24\.	Pneumopathie à Haemophilus influenzae  
25\.	Décompensation de pneumopathie interstitielle chronique compliquée de défaillance cardiaque  
26\.	Insuffisance rénale aiguë fonctionnelle (secondaire à la déplétion)  
27\.	Acidose mixte (secondaire à la décompensation respiratoire)

*   
* Output

   When provided with an input such as “patient présentant une dyspnée”, the system should return:

  * One or more relevant ICD-10 code suggestions, extracted from CoCoA.  
  * A concise explanation of each code, justifying why it is relevant.  
  * **Bonus**: additional information about this code, found in `CoCoA`.

\<aside\>  
 🎥

**Constraints**

\</aside\>

* Total time to be spent: approximately 3–4 hours.  
* No restrictions on tools or frameworks → your choice.  
* **If you have an AI/ML background**  
  * Use either the `NestJS` or `Python` stack to complete this exercise.  
* **If you have a Full Stack background**  
  * Use the `NestJS` stack to complete this exercise.

\<aside\>  
 🏮

**Bonus Points**

\</aside\>

* **If you have an AI/ML background**

   If you have an AI/ML background, here are some **bonus challenges** that can earn you extra points:

  * Smart use of embeddings and vector search optimization (chunking strategy)  
  * Relevant prompt engineering techniques  
  * Enhancements to the retrieval pipeline (e.g. re-ranking, hybrid search, metadata, code hierarchy)  
  * A solid approach to evaluating performance (evaluation metrics, validation set)  
  * Suggestions for scaling or improving the system with ML techniques  
* **If you have a Full Stack background**

   If you have a Full Stack background, you can earn extra points by:

  * Use Hexa Architecture and Domain Driven Design  
  * Delivering a clean and responsive UI to test the RAG system  
  * Deploying the solution (e.g. Vercel, Streamlit, Docker, etc.)  
  * Implement authentication (JWT-based or simple session-based authentication).  
  * Adding usage logging, basic analytics, or monitoring  
  * Implement unit tests (Jest or another testing framework)

\<aside\>  
 📂

**What to Include in Your Submission**

\</aside\>

* A private GitHub repository or a zip file containing your solution's source code.  
* Instructions to run your solution \+ some videos / screenshots of your solution  
* A clear and complete explanation of your technical choices and implementation \+ documentation. A theoretical explanation of the RAG system and how your architecture works would be appreciated  
* The limitations of your solution and implementation.  
* Suggestions for improvement and further development if you were to continue the work.

\<aside\>  
 👨‍🏫

**Evaluation**

\</aside\>

We will review your technical test together through a PR (pull request) review. I will ask questions about your choices and the challenges you faced, and we will dive deeper into some technical aspects if needed.

Given the time constraints, you’ll need to make significant implementation choices. It’s up to you to make and justify them.

**Good luck and enjoy the exercise\! 💪**

